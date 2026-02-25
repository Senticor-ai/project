import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Parser, Store, DataFactory } from "n3";
import SHACLValidator from "rdf-validate-shacl";
import type { ValidationIssue } from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Loads the SHACL shapes graph from shapes.ttl
 * Cached at module load time for reuse across validations
 */
let shapesGraph: Store | null = null;

function loadShapes(): Store {
  if (shapesGraph) {
    return shapesGraph;
  }

  const shapesPath = join(__dirname, "shapes.ttl");
  const shapesContent = readFileSync(shapesPath, "utf-8");

  const store = new Store();
  const parser = new Parser({ format: "text/turtle" });
  const quads = parser.parse(shapesContent);

  for (const quad of quads) {
    store.add(quad);
  }

  shapesGraph = store;
  return shapesGraph;
}

/**
 * Converts a SHACL validation result to a ValidationIssue
 */
function resultToIssue(result: any): ValidationIssue {
  // Extract the path from the result
  let field: string | undefined;
  if (result.path) {
    const pathValue = result.path.value;
    // Convert URI to short form (e.g., https://schema.org/name -> schema:name)
    if (pathValue.startsWith("https://schema.org/")) {
      field = `schema:${pathValue.substring("https://schema.org/".length)}`;
    } else if (pathValue.startsWith("urn:app:property:")) {
      field = `app:${pathValue.substring("urn:app:property:".length)}`;
    } else {
      field = pathValue;
    }
  }

  // Extract message
  const message = Array.isArray(result.message)
    ? result.message[0]?.value || "Validation constraint violated"
    : result.message?.value || "Validation constraint violated";

  // Generate error code from constraint component
  let code = "SHACL_VIOLATION";
  if (result.sourceConstraintComponent) {
    const component = result.sourceConstraintComponent.value;
    if (component.includes("MinCountConstraintComponent")) {
      code = field === "@type" ? "TYPE_REQUIRED" : "REQUIRED_PROPERTY_MISSING";
    } else if (component.includes("InConstraintComponent")) {
      code = "INVALID_VALUE";
    } else if (component.includes("DatatypeConstraintComponent")) {
      code = "INVALID_DATATYPE";
    }
  }

  return {
    source: "shacl",
    code,
    message,
    field,
  };
}

/**
 * Validates an item against SHACL shapes
 *
 * @param item - The item to validate (as a JavaScript object)
 * @param abortOnFirst - If true, stops validation at first violation (CLI fail-fast)
 * @returns Array of validation issues (empty if valid)
 */
export function validateWithShacl(
  item: Record<string, unknown>,
  abortOnFirst = true,
): ValidationIssue[] {
  try {
    const itemType = item["@type"];
    if (itemType == null || (Array.isArray(itemType) && itemType.length === 0)) {
      return [
        {
          source: "shacl",
          code: "TYPE_REQUIRED",
          message: "@type is required.",
          field: "@type",
        },
      ];
    }

    // Load shapes graph
    const shapes = loadShapes();

    // Convert item to RDF graph
    const dataStore = new Store();
    const itemNode = DataFactory.blankNode();

    // Add @type
    const typeValue = Array.isArray(itemType) ? itemType[0] : itemType;
    let typeUri = "";
    if (typeof typeValue === "string") {
      if (typeValue.startsWith("schema:")) {
        // schema:Action -> https://schema.org/Action
        typeUri = `https://schema.org/${typeValue.substring(7)}`;
      } else if (typeValue.startsWith("http://") || typeValue.startsWith("https://")) {
        // Already a full URI
        typeUri = typeValue;
      } else {
        // Plain name like "Action" -> https://schema.org/Action
        typeUri = `https://schema.org/${typeValue}`;
      }
    }
    if (typeUri) {
      dataStore.add(
        DataFactory.quad(
          itemNode,
          DataFactory.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
          DataFactory.namedNode(typeUri),
        ),
      );
    }

    // Add direct properties (schema:name, etc.)
    for (const [key, value] of Object.entries(item)) {
      if (key === "@type" || key === "additionalProperty") {
        continue;
      }

      const predicate =
        key.startsWith("schema:")
          ? DataFactory.namedNode(`https://schema.org/${key.substring(7)}`)
          : key === "name"
            ? DataFactory.namedNode("https://schema.org/name")
          : DataFactory.namedNode(key);

      const objectValue = typeof value === "string" ? value : String(value ?? "");
      dataStore.add(
        DataFactory.quad(itemNode, predicate, DataFactory.literal(objectValue)),
      );
    }

    // Add additionalProperty values (app:bucket, app:orgRef, etc.)
    const additionalProps = item.additionalProperty;
    if (Array.isArray(additionalProps)) {
      for (const prop of additionalProps) {
        if (prop && typeof prop === "object") {
          const propId = (prop as any).propertyID;
          const propValue = (prop as any).value;

          if (typeof propId === "string" && propId.startsWith("app:")) {
            const predicate = DataFactory.namedNode(
              `urn:app:property:${propId.substring(4)}`,
            );
            const objectValue = typeof propValue === "string" ? propValue : String(propValue ?? "");
            dataStore.add(
              DataFactory.quad(itemNode, predicate, DataFactory.literal(objectValue)),
            );
          }
        }
      }
    }

    // Create validator with maxErrors option for abort-on-first behavior
    const validator = new SHACLValidator(shapes, {
      maxErrors: abortOnFirst ? 1 : undefined,
    });

    // Validate
    const report = validator.validate(dataStore);

    // Check conformance
    if (report.conforms) {
      return [];
    }

    // Convert results to ValidationIssue format
    const issues: ValidationIssue[] = [];
    for (const result of report.results) {
      issues.push(resultToIssue(result));
    }

    return issues;
  } catch (error) {
    // If validation itself fails, return an error issue
    return [
      {
        source: "shacl",
        code: "VALIDATION_ERROR",
        message: `SHACL validation failed: ${error}`,
      },
    ];
  }
}

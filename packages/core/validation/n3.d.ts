declare module "n3" {
  export type Quad = any;

  export class Store implements Iterable<Quad> {
    size: number;
    add(quad: Quad): this;
    delete(quad: Quad): this;
    has(quad: Quad): boolean;
    match(
      subject?: unknown,
      predicate?: unknown,
      object?: unknown,
      graph?: unknown,
    ): Store;
    [Symbol.iterator](): Iterator<Quad>;
  }

  export class Parser {
    constructor(options?: { format?: string });
    parse(input: string): Quad[];
  }

  export const DataFactory: {
    blankNode(value?: string): unknown;
    namedNode(value: string): unknown;
    literal(value: string): unknown;
    quad(
      subject: unknown,
      predicate: unknown,
      object: unknown,
      graph?: unknown,
    ): Quad;
  };
}

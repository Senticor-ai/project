import { describe, it, expect } from "vitest";
import {
  classifyText,
  classifyFile,
  classifyUrl,
  type IntakeClassification,
} from "./intake-classifier";

describe("intake-classifier", () => {
  // -----------------------------------------------------------------------
  // classifyText
  // -----------------------------------------------------------------------
  describe("classifyText", () => {
    it("classifies plain text as Action", () => {
      const result = classifyText("Buy milk");
      expect(result).toEqual<IntakeClassification>({
        schemaType: "Action",
        confidence: "medium",
        captureSource: { kind: "thought" },
      });
    });

    it("classifies empty-ish text as Action", () => {
      const result = classifyText("  some note  ");
      expect(result.schemaType).toBe("Action");
      expect(result.captureSource).toEqual({ kind: "thought" });
    });

    it("classifies https URL as CreativeWork", () => {
      const result = classifyText("https://example.com/doc.pdf");
      expect(result).toEqual<IntakeClassification>({
        schemaType: "CreativeWork",
        confidence: "medium",
        captureSource: { kind: "url", url: "https://example.com/doc.pdf" },
      });
    });

    it("classifies http URL as CreativeWork", () => {
      const result = classifyText("http://example.com/page");
      expect(result.schemaType).toBe("CreativeWork");
      expect(result.captureSource).toEqual({
        kind: "url",
        url: "http://example.com/page",
      });
    });

    it("does not classify text containing a URL as CreativeWork", () => {
      const result = classifyText(
        "Check out this link: https://example.com/page",
      );
      expect(result.schemaType).toBe("Action");
      expect(result.captureSource).toEqual({ kind: "thought" });
    });

    it("does not classify URL-like substrings without protocol", () => {
      const result = classifyText("example.com/page");
      expect(result.schemaType).toBe("Action");
    });
  });

  // -----------------------------------------------------------------------
  // classifyFile
  // -----------------------------------------------------------------------
  describe("classifyFile", () => {
    it("classifies PDF as DigitalDocument", () => {
      const file = new File([], "report.pdf", { type: "application/pdf" });
      const result = classifyFile(file);
      expect(result).toEqual<IntakeClassification>({
        schemaType: "DigitalDocument",
        confidence: "medium",
        captureSource: {
          kind: "file",
          fileName: "report.pdf",
          mimeType: "application/pdf",
        },
        encodingFormat: "application/pdf",
      });
    });

    it("classifies Word document as DigitalDocument", () => {
      const file = new File([], "doc.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.encodingFormat).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
    });

    it("classifies .eml as EmailMessage with extractable entities", () => {
      const file = new File([], "message.eml", { type: "message/rfc822" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("EmailMessage");
      expect(result.extractableEntities).toEqual(["Person", "Organization"]);
    });

    it("classifies .vcf as DigitalDocument with Person/Organization extractable", () => {
      const file = new File([], "contact.vcf", { type: "text/vcard" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.extractableEntities).toEqual(["Person", "Organization"]);
    });

    it("classifies .ics as DigitalDocument with Event/Person extractable", () => {
      const file = new File([], "meeting.ics", { type: "text/calendar" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.extractableEntities).toEqual(["Event", "Person"]);
    });

    it("classifies image as DigitalDocument", () => {
      const file = new File([], "photo.jpg", { type: "image/jpeg" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.encodingFormat).toBe("image/jpeg");
    });

    it("falls back to extension when MIME is empty", () => {
      const file = new File([], "message.eml", { type: "" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("EmailMessage");
      expect(result.extractableEntities).toEqual(["Person", "Organization"]);
    });

    it("falls back to extension for .vcf with empty MIME", () => {
      const file = new File([], "contact.vcf", { type: "" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.extractableEntities).toEqual(["Person", "Organization"]);
    });

    it("falls back to extension for .ics with empty MIME", () => {
      const file = new File([], "event.ics", { type: "" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.extractableEntities).toEqual(["Event", "Person"]);
    });

    it("falls back to DigitalDocument for unknown MIME type", () => {
      const file = new File([], "data.xyz", {
        type: "application/x-unknown",
      });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.encodingFormat).toBe("application/x-unknown");
      expect(result.extractableEntities).toBeUndefined();
    });

    it("falls back to DigitalDocument for unknown extension and empty MIME", () => {
      const file = new File([], "data.xyz", { type: "" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
      expect(result.extractableEntities).toBeUndefined();
    });

    it("sets captureSource kind to file with fileName and mimeType", () => {
      const file = new File([], "report.pdf", { type: "application/pdf" });
      const result = classifyFile(file);
      expect(result.captureSource).toEqual({
        kind: "file",
        fileName: "report.pdf",
        mimeType: "application/pdf",
      });
    });

    it("classifies Outlook .msg as EmailMessage", () => {
      const file = new File([], "mail.msg", {
        type: "application/vnd.ms-outlook",
      });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("EmailMessage");
      expect(result.extractableEntities).toEqual(["Person", "Organization"]);
    });

    it("classifies CSV as DigitalDocument", () => {
      const file = new File([], "data.csv", { type: "text/csv" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("DigitalDocument");
    });

    it("classifies HTML as CreativeWork", () => {
      const file = new File([], "page.html", { type: "text/html" });
      const result = classifyFile(file);
      expect(result.schemaType).toBe("CreativeWork");
    });
  });

  // -----------------------------------------------------------------------
  // classifyUrl
  // -----------------------------------------------------------------------
  describe("classifyUrl", () => {
    it("classifies URL as CreativeWork", () => {
      const result = classifyUrl("https://example.com");
      expect(result).toEqual<IntakeClassification>({
        schemaType: "CreativeWork",
        confidence: "medium",
        captureSource: { kind: "url", url: "https://example.com" },
      });
    });

    it("preserves full URL in captureSource", () => {
      const url = "https://example.com/path?query=1#fragment";
      const result = classifyUrl(url);
      expect(result.captureSource).toEqual({ kind: "url", url });
    });
  });
});

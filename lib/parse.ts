import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export async function fileToText(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let text: string;
  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (name.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  } else if (name.endsWith(".txt") || name.endsWith(".md")) {
    text = buf.toString("utf8");
  } else {
    throw new Error(`Unsupported file type: ${file.name} (use PDF, DOCX or TXT)`);
  }
  text = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) {
    throw new Error(`${file.name}: almost no text found. Is it a scanned image? Upload a text-based PDF or DOCX.`);
  }
  return text;
}

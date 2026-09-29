/**
 * pdf.js —— PDF 文字提取模块
 *
 * 使用 pdfjs-dist 逐页提取文字，保留页码。
 * 遇到扫描版（无文字层）、加密文件、空文本或解析失败时，
 * 抛出带友好中文信息的错误，提示用户改用粘贴文本。
 */

async function extractPdfPages(buffer) {
  // 动态加载，避免启动时就加载整个 pdfjs
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  let doc;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      // 服务器端不需要字体和渲染，只取文字
      disableFontFace: true,
      verbosity: 0,
    });
    doc = await loadingTask.promise;
  } catch (e) {
    if (e && e.name === "PasswordException") {
      throw friendlyError("这个 PDF 已加密，无法读取。请解除密码后重试，或直接粘贴可复制的论文文本。");
    }
    throw friendlyError("PDF 文件无法解析，文件可能已损坏或不是有效的 PDF。建议直接粘贴可复制的论文文本。");
  }

  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: i, text });
    }
  } catch (e) {
    throw friendlyError("PDF 读取过程中出错。建议直接粘贴可复制的论文文本。");
  } finally {
    doc.destroy().catch(() => {});
  }

  const totalText = pages.map((p) => p.text).join("").trim();
  if (totalText.length === 0) {
    throw friendlyError(
      "没有从这个 PDF 中提取到任何文字。它很可能是扫描版（图片型）PDF，本版本暂不支持 OCR 识别。请粘贴可复制的论文文本。"
    );
  }

  return pages;
}

function friendlyError(message) {
  const err = new Error(message);
  err.code = "PDF_ERROR";
  return err;
}

module.exports = { extractPdfPages };

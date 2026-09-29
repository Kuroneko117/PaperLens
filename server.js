/**
 * server.js —— PaperLens 后端服务
 *
 * 接口：
 *   GET  /            → 前端页面
 *   GET  /api/status  → 检查模型服务是否已配置
 *   POST /api/extract-pdf → 上传 PDF，提取每页文字
 *   POST /api/summary → 根据论文文本生成四部分摘要
 *   POST /api/ask     → 根据论文文本回答问题
 */

require("dotenv").config();
const path = require("path");
const express = require("express");
const multer = require("multer");
const llm = require("./llm");
const { extractPdfPages } = require("./pdf");

const app = express();
const PORT = process.env.PORT || 3000;

// 上传限制：最大 20MB，只接受 PDF，文件放内存不落盘（保护隐私）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("只支持 PDF 文件"));
    }
  },
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// 把每页文本拼成带页码标记的整体文本
function pagesToMarkedText(pages) {
  return pages.map((p) => `[第${p.page}页]\n${p.text}`).join("\n\n");
}

// 限制发送给模型的文本长度，避免超出模型上下文
function truncateText(text, maxChars = 24000) {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n……（论文过长，此处已截断，仅使用前部分内容）";
}

app.get("/api/status", (req, res) => {
  res.json({ configured: llm.isConfigured() });
});

app.post("/api/extract-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "没有收到文件，请选择 PDF 后重试。" });
    }
    const pages = await extractPdfPages(req.file.buffer);
    res.json({ pages, text: pagesToMarkedText(pages), pageCount: pages.length });
  } catch (e) {
    const status = e.code === "PDF_ERROR" ? 422 : 500;
    res.status(status).json({ error: e.message || "PDF 解析失败，建议粘贴可复制的论文文本。" });
  }
});

app.post("/api/summary", async (req, res) => {
  try {
    if (!llm.isConfigured()) {
      return res.status(503).json({
        error: "模型服务未配置 API Key，无法生成 AI 摘要。请按 README 第 4 步配置 .env 文件后重启服务。",
        code: "NOT_CONFIGURED",
      });
    }
    const text = (req.body.text || "").trim();
    if (text.length < 50) {
      return res.status(400).json({ error: "论文文本太短，请提供更多内容（至少 50 个字符）。" });
    }
    const reply = await llm.chat(
      llm.SUMMARY_SYSTEM_PROMPT,
      `以下是论文文本：\n\n${truncateText(text)}\n\n请按要求的 JSON 结构输出四部分摘要。`
    );
    // 尝试解析 JSON；解析失败时把原文返回给前端展示
    let summary = null;
    try {
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) summary = JSON.parse(match[0]);
    } catch (_) {}
    res.json({ summary, raw: summary ? null : reply });
  } catch (e) {
    res.status(e.code === "LLM_ERROR" ? 502 : 500).json({ error: e.message });
  }
});

app.post("/api/ask", async (req, res) => {
  try {
    if (!llm.isConfigured()) {
      return res.status(503).json({
        error: "模型服务未配置 API Key，无法回答。请按 README 第 4 步配置 .env 文件后重启服务。",
        code: "NOT_CONFIGURED",
      });
    }
    const text = (req.body.text || "").trim();
    const question = (req.body.question || "").trim();
    if (text.length < 50) {
      return res.status(400).json({ error: "请先提供论文内容，再提问。" });
    }
    if (!question) {
      return res.status(400).json({ error: "请输入你的问题。" });
    }
    const answer = await llm.chat(
      llm.QA_SYSTEM_PROMPT,
      `以下是论文文本：\n\n${truncateText(text)}\n\n用户的问题：${question}`
    );
    res.json({ answer });
  } catch (e) {
    res.status(e.code === "LLM_ERROR" ? 502 : 500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`PaperLens 已启动: http://localhost:${PORT}`);
  console.log(`模型服务状态: ${llm.isConfigured() ? "已配置" : "未配置（页面会提示如何配置）"}`);
});

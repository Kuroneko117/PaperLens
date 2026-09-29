/* PaperLens 前端逻辑 */

// 演示文本（明确标注为演示内容，虚构的短论文）
const DEMO_TEXT = `【演示内容】这是一段虚构的示例论文文本，仅用于第一次体验 PaperLens 的功能，不代表真实研究。

题目：睡眠时长对大学生课堂注意力的影响：一项问卷调查

摘要：本研究探讨睡眠时长与大学生课堂注意力之间的关系。

一、研究问题
已有研究表明睡眠不足会损害认知功能，但针对中国大学生课堂情境的实证研究较少。本研究旨在回答：每晚睡眠时长是否与大学生课堂注意力水平显著相关？

二、研究方法
本研究采用问卷调查法，于 2025 年 3 月在某一所高校发放问卷，共回收有效问卷 214 份（男生 98 人，女生 116 人）。睡眠时长通过自报过去一周平均每晚睡眠小时数测量；课堂注意力采用自编 10 题量表（Cronbach α = 0.87）测量。数据使用相关分析和多元回归分析处理，控制了性别、年级和咖啡因摄入。

三、主要结果
相关分析显示，睡眠时长与课堂注意力得分呈显著正相关（r = 0.42, p < 0.01）。回归分析表明，在控制变量后，睡眠时长每增加 1 小时，课堂注意力得分平均提高 3.1 分（β = 0.38, p < 0.01）。睡眠不足 6 小时的学生组注意力得分显著低于睡眠 7 小时以上组。

四、局限性
本研究存在以下局限：第一，样本仅来自一所高校，代表性有限；第二，睡眠时长为自报数据，可能存在回忆偏差；第三，横断面设计无法推断因果关系；第四，未测量睡眠质量，仅关注时长。`;

const $ = (id) => document.getElementById(id);

// ---------- 初始化：检查模型配置状态 ----------
(async function init() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (!data.configured) $("config-warning").classList.remove("hidden");
  } catch (_) {
    // 状态检查失败不影响页面使用
  }
})();

// ---------- 选项卡切换 ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    $("tab-" + tab.dataset.tab).classList.remove("hidden");
  });
});

// ---------- 字数统计 ----------
$("paper-text").addEventListener("input", () => {
  $("char-count").textContent = $("paper-text").value.length + " 字";
});

// ---------- 演示文本 ----------
$("btn-demo").addEventListener("click", () => {
  $("paper-text").value = DEMO_TEXT;
  $("char-count").textContent = DEMO_TEXT.length + " 字";
});

// ---------- PDF 上传 ----------
$("pdf-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const box = $("pdf-result");
  box.classList.remove("hidden", "error");
  box.textContent = "正在解析 PDF，请稍候…";

  const form = new FormData();
  form.append("pdf", file);
  try {
    const res = await fetch("/api/extract-pdf", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "PDF 解析失败");
    // 提取成功：自动填入文本框，供摘要和问答使用
    $("paper-text").value = data.text;
    $("char-count").textContent = data.text.length + " 字";
    box.textContent = `✅ 解析成功：共 ${data.pageCount} 页，提取 ${data.text.length} 字，已自动填入"粘贴文本"框（带页码标记）。`;
  } catch (err) {
    box.classList.add("error");
    box.textContent = "❌ " + err.message;
  }
});

// ---------- 工具：取论文文本 ----------
function getPaperText() {
  return $("paper-text").value.trim();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败，请稍后重试");
  return data;
}

// ---------- 生成摘要 ----------
$("btn-summary").addEventListener("click", async () => {
  const text = getPaperText();
  const status = $("summary-status");
  status.className = "status";
  if (text.length < 50) {
    status.classList.add("error");
    status.textContent = "请先在第一步提供论文内容（至少 50 个字符）。";
    return;
  }
  const btn = $("btn-summary");
  btn.disabled = true;
  status.textContent = "正在生成摘要，通常需要十几秒，请耐心等待…";
  $("summary-output").classList.add("hidden");
  $("summary-raw").classList.add("hidden");

  try {
    const data = await postJSON("/api/summary", { text });
    status.textContent = "";
    if (data.summary) {
      $("s-question").textContent = data.summary["研究问题"] || "（无内容）";
      $("s-method").textContent = data.summary["研究方法"] || "（无内容）";
      $("s-result").textContent = data.summary["主要结果"] || "（无内容）";
      $("s-limitation").textContent = data.summary["局限性"] || "（无内容）";
      $("summary-output").classList.remove("hidden");
    } else {
      // 模型没返回标准 JSON，原样展示
      $("summary-raw").textContent = data.raw;
      $("summary-raw").classList.remove("hidden");
    }
  } catch (err) {
    status.classList.add("error");
    status.textContent = "❌ " + err.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- 问答 ----------
$("btn-ask").addEventListener("click", async () => {
  const text = getPaperText();
  const question = $("question-input").value.trim();
  if (text.length < 50) {
    alert("请先在第一步提供论文内容，再提问。");
    return;
  }
  if (!question) {
    alert("请输入你的问题。");
    return;
  }
  const btn = $("btn-ask");
  btn.disabled = true;
  btn.textContent = "思考中…";

  const item = document.createElement("div");
  item.className = "qa-item";
  item.innerHTML = `<div class="q">问：${escapeHtml(question)}</div><div class="a">正在生成回答…</div>`;
  $("qa-list").prepend(item);

  try {
    const data = await postJSON("/api/ask", { text, question });
    item.querySelector(".a").textContent = data.answer;
  } catch (err) {
    item.querySelector(".a").textContent = "❌ " + err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "提问";
    $("question-input").value = "";
  }
});

// 回车提交问题
$("question-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btn-ask").click();
});

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

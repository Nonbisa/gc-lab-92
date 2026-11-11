const $ = (selector) => document.querySelector(selector);
const REQUIRED_HEADERS = ["부서", "성명", "고유식별번호", "종별", "기간", "일/시간"];
const LEAVE_PATTERN = /연가|병가|특별|공가|휴가|포상|장기재직|대체휴무|기타/;
const DAY_MINUTES = 480;
const FOUR_HOURS = 240;

let selectedFile = null;
let analysis = null;
let activeView = "annual";
let searchText = "";

function text(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function normalizeId(value) {
  return text(value).replace(/\.0$/, "");
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function minutesFromAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * DAY_MINUTES);
  const raw = text(value);
  if (!raw) return 0;
  if (raw.includes("반차")) return 240;
  const days = Number(raw.match(/([\d.]+)\s*일/)?.[1] || 0);
  const hours = Number(raw.match(/([\d.]+)\s*시간/)?.[1] || 0);
  const minutes = Number(raw.match(/([\d.]+)\s*분/)?.[1] || 0);
  if (days || hours || minutes) return Math.round(days * DAY_MINUTES + hours * 60 + minutes);
  const numeric = Number(raw.replace(/,/g, ""));
  return Number.isFinite(numeric) ? Math.round(numeric * DAY_MINUTES) : 0;
}

function isPureDays(value) {
  return /^\s*[\d.]+\s*일\s*$/.test(text(value));
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value === "number" && typeof XLSX !== "undefined") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const match = text(value).match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function datesFromPeriod(period) {
  const parts = text(period).split(/\s*[~～]\s*/);
  let start = parseDate(parts[0]);
  let end = parseDate(parts[1] || parts[0]);
  if (!start || !end) return [];
  if (end < start) [start, end] = [end, start];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end && dates.length < 370) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function yearFromPeriod(period) {
  return parseDate(text(period).split(/\s*[~～]\s*/)[0])?.getFullYear() || "";
}

function keyOf(...values) {
  return values.map(text).join("\u001f");
}

function sumGroups(rows, keys, valueKey) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = keyOf(...keys.map((name) => row[name]));
    if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(keys.map((name) => [name, row[name]])), [valueKey]: 0 });
    groups.get(key)[valueKey] += Number(row[valueKey] || 0);
  });
  return [...groups.values()].map((row) => ({ ...row, [valueKey]: round(row[valueKey]) }));
}

function detailText(items) {
  const counts = new Map();
  items.filter(Boolean).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1));
  return [...counts].sort(([a], [b]) => a.localeCompare(b, "ko")).map(([item, count]) => count > 1 ? `${item}×${count}` : item).join(" / ");
}

function normalizeRows(sourceRows) {
  return sourceRows.map((source) => {
    const row = {};
    Object.entries(source).forEach(([key, value]) => { row[text(key)] = value; });
    return row;
  }).filter((row) => Object.values(row).some((value) => text(value)));
}

function analyzeRows(sourceRows) {
  const rows = normalizeRows(sourceRows);
  const headers = new Set(rows.flatMap((row) => Object.keys(row)));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length) throw new Error(`필수 열이 없습니다: ${missing.join(", ")}`);

  const records = rows.map((row) => ({
    부서: text(row["부서"]), 직급: text(row["직급"]), 성명: text(row["성명"]), 고유식별번호: normalizeId(row["고유식별번호"]),
    종별: text(row["종별"]), 기간: text(row["기간"]), "일/시간": text(row["일/시간"]), 사유: text(row["사유"]),
    연도: yearFromPeriod(row["기간"]), 사용분: minutesFromAmount(row["일/시간"]),
  })).filter((row) => row.성명 && row.종별 && row.기간);
  if (!records.length) throw new Error("분석할 복무 내역을 찾지 못했습니다.");

  const annual = sumGroups(records.filter((row) => row.종별 === "연가" && row.연도).map((row) => ({ ...row, 연가일수: row.사용분 / DAY_MINUTES })), ["연도", "부서", "성명", "고유식별번호"], "연가일수");
  const detail = sumGroups(records.filter((row) => row.연도).map((row) => ({ ...row, 휴가일수: row.사용분 / DAY_MINUTES })), ["연도", "부서", "성명", "고유식별번호", "종별"], "휴가일수");

  const leaveTypes = [...new Set(detail.map((row) => row.종별))].sort((a, b) => a.localeCompare(b, "ko"));
  const pivotMap = new Map();
  detail.forEach((row) => {
    const key = keyOf(row.연도, row.부서, row.성명, row.고유식별번호);
    if (!pivotMap.has(key)) pivotMap.set(key, { 연도: row.연도, 부서: row.부서, 성명: row.성명, 고유식별번호: row.고유식별번호, ...Object.fromEntries(leaveTypes.map((type) => [type, 0])) });
    pivotMap.get(key)[row.종별] = round(row.휴가일수);
  });
  const pivot = [...pivotMap.values()];

  const daily = [];
  records.forEach((row) => {
    const dates = datesFromPeriod(row.기간);
    if (!dates.length || row.사용분 <= 0) return;
    const portions = isPureDays(row["일/시간"]) && dates.length > 1
      ? dates.map(() => row.사용분 / dates.length)
      : dates.map((_, index) => index === 0 ? row.사용분 : 0);
    dates.forEach((date, index) => {
      if (portions[index] > 0) daily.push({ ...row, 일자: date, 분: portions[index], 상세: `${row.종별}(${row["일/시간"]})` });
    });
  });

  const childcare = daily.filter((row) => row.종별.includes("육아"));
  const otherLeave = daily.filter((row) => !row.종별.includes("육아") && LEAVE_PATTERN.test(row.종별));
  const childcareMap = new Map();
  const leaveMap = new Map();
  const addDaily = (map, row) => {
    const key = keyOf(row.부서, row.성명, row.고유식별번호, row.일자);
    if (!map.has(key)) map.set(key, { 부서: row.부서, 성명: row.성명, 고유식별번호: row.고유식별번호, 일자: row.일자, 분: 0, details: [] });
    map.get(key).분 += row.분;
    map.get(key).details.push(row.상세);
  };
  childcare.forEach((row) => addDaily(childcareMap, row));
  otherLeave.forEach((row) => addDaily(leaveMap, row));

  const rankMap = new Map(records.map((row) => [keyOf(row.부서, row.성명, row.고유식별번호), row.직급]));
  const combined = [...childcareMap.keys()].filter((key) => leaveMap.has(key)).map((key) => {
    const child = childcareMap.get(key);
    const leave = leaveMap.get(key);
    const base = child;
    const childcareMinutes = round(child?.분 || 0, 2);
    const leaveMinutes = round(leave?.분 || 0, 2);
    const total = round(childcareMinutes + leaveMinutes, 2);
    return {
      부서: base.부서, 성명: base.성명, 고유식별번호: base.고유식별번호, 일자: base.일자,
      육아분: childcareMinutes, 휴가분: leaveMinutes, 합계분: total,
    };
  }).sort((a, b) => a.일자.localeCompare(b.일자) || a.부서.localeCompare(b.부서, "ko") || a.성명.localeCompare(b.성명, "ko"));

  const flagged = combined.filter((row) => row.합계분 > FOUR_HOURS).map((row) => {
    const key = keyOf(row.부서, row.성명, row.고유식별번호, row.일자);
    return {
      부서: row.부서, 직급: rankMap.get(keyOf(row.부서, row.성명, row.고유식별번호)) || "", 성명: row.성명,
      고유식별번호: row.고유식별번호, 일자: row.일자, 육아시간: round(row.육아분 / 60, 2),
      휴가시간: round(row.휴가분 / 60, 2), 합계시간: round(row.합계분 / 60, 2),
      육아내역: detailText(childcareMap.get(key)?.details || []), 휴가내역: detailText(leaveMap.get(key)?.details || []),
    };
  });
  const people = new Set(records.map((row) => keyOf(row.성명, row.고유식별번호))).size;
  return { records, annual, detail, pivot, combined, flagged, leaveTypes, people };
}

function setNotice(message, tone = "") {
  const notice = $("#notice");
  notice.className = `notice${tone ? ` ${tone}` : ""}`;
  notice.innerHTML = `${escapeHtml(message)} <span class="cursor"></span>`;
}

function rowsForView() {
  const maps = { annual: analysis.annual, pivot: analysis.pivot, flagged: analysis.flagged, detail: analysis.detail, combined: analysis.combined };
  return maps[activeView] || [];
}

function renderTable() {
  const allRows = rowsForView();
  const rows = allRows.filter((row) => !searchText || Object.values(row).some((value) => text(value).toLowerCase().includes(searchText)));
  const preferred = {
    annual: ["연도", "부서", "성명", "고유식별번호", "연가일수"],
    detail: ["연도", "부서", "성명", "고유식별번호", "종별", "휴가일수"],
    flagged: ["부서", "직급", "성명", "고유식별번호", "일자", "육아시간", "휴가시간", "합계시간", "육아내역", "휴가내역"],
    combined: ["부서", "성명", "고유식별번호", "일자", "육아분", "휴가분", "합계분"],
  };
  const columns = preferred[activeView] || (allRows[0] ? Object.keys(allRows[0]) : ["결과"]);
  $("#resultTable thead").innerHTML = `<tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>`;
  $("#resultTable tbody").innerHTML = rows.length ? rows.map((row) => {
    return `<tr${activeView === "flagged" ? ' class="flagged"' : ""}>${columns.map((column) => {
      const value = row[column] ?? "";
      return `<td${typeof value === "number" ? ' class="number"' : ""}>${escapeHtml(value)}</td>`;
    }).join("")}</tr>`;
  }).join("") : `<tr><td class="empty" colspan="${columns.length}">표시할 결과가 없습니다.</td></tr>`;
  $("#rowNote").textContent = `${allRows.length.toLocaleString()}건 중 ${rows.length.toLocaleString()}건 표시`;
}

function worksheet(rows, columns) {
  const sheet = rows.length ? XLSX.utils.json_to_sheet(rows, { header: columns }) : XLSX.utils.aoa_to_sheet([columns]);
  sheet["!cols"] = columns.map((column) => ({ wch: Math.max(12, Math.min(36, column.length * 2 + 4)) }));
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
  for (let column = range.s.c; column <= range.e.c; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
    if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "153D75" } }, alignment: { horizontal: "center" } };
  }
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  return sheet;
}

function downloadWorkbook() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet(analysis.annual, ["연도", "부서", "성명", "고유식별번호", "연가일수"]), "연가_개인별");
  XLSX.utils.book_append_sheet(workbook, worksheet(analysis.detail, ["연도", "부서", "성명", "고유식별번호", "종별", "휴가일수"]), "휴가_상세");
  XLSX.utils.book_append_sheet(workbook, worksheet(analysis.pivot, ["연도", "부서", "성명", "고유식별번호", ...analysis.leaveTypes]), "휴가_피벗");
  XLSX.utils.book_append_sheet(workbook, worksheet(analysis.flagged, ["부서", "직급", "성명", "고유식별번호", "일자", "육아시간", "휴가시간", "합계시간", "육아내역", "휴가내역"]), "육아_휴가_4h초과");
  XLSX.utils.book_append_sheet(workbook, worksheet(analysis.combined, ["부서", "성명", "고유식별번호", "일자", "육아분", "휴가분", "합계분"]), "육아_휴가_요약");
  const name = selectedFile.name.replace(/\.(xlsx|xls)$/i, "");
  XLSX.writeFile(workbook, `${name}_분석결과.xlsx`);
}

async function readFile() {
  if (typeof XLSX === "undefined") throw new Error("엑셀 처리 모듈을 불러오지 못했습니다. 인터넷 연결을 확인해주세요.");
  const workbook = XLSX.read(await selectedFile.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.includes("Sheet1") ? "Sheet1" : workbook.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트를 찾지 못했습니다.");
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: true });
}

function chooseFile(file) {
  if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    setNotice("엑셀 파일(.xlsx, .xls)만 선택할 수 있습니다.", "error");
    return;
  }
  selectedFile = file;
  $("#fileLabel").textContent = `${file.name} · ${(file.size / 1024).toFixed(1)}KB`;
  $("#fileDrop").classList.add("ready");
  $("#run").disabled = false;
  setNotice("파일이 준비됐습니다. 분석 버튼을 누르세요.");
}

$("#fileInput").addEventListener("change", (event) => chooseFile(event.target.files[0]));
["dragenter", "dragover"].forEach((type) => $("#fileDrop").addEventListener(type, (event) => { event.preventDefault(); $("#fileDrop").classList.add("drag"); }));
["dragleave", "drop"].forEach((type) => $("#fileDrop").addEventListener(type, (event) => { event.preventDefault(); $("#fileDrop").classList.remove("drag"); }));
$("#fileDrop").addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));

$("#run").addEventListener("click", async () => {
  $("#run").disabled = true;
  setNotice("복무자료를 분석하고 있습니다...");
  try {
    analysis = analyzeRows(await readFile());
    $("#rowCount").textContent = analysis.records.length.toLocaleString();
    $("#peopleCount").textContent = analysis.people.toLocaleString();
    $("#annualCount").textContent = analysis.annual.length.toLocaleString();
    $("#flagCount").textContent = analysis.flagged.length.toLocaleString();
    $("#results").classList.remove("hidden");
    setNotice(`분석 완료 · 4시간 초과 ${analysis.flagged.length.toLocaleString()}건`, "ok");
    renderTable();
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setNotice(error.message || "파일을 분석하지 못했습니다.", "error");
  } finally {
    $("#run").disabled = false;
  }
});

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  button.classList.add("active");
  activeView = button.dataset.view;
  renderTable();
}));

$("#search").addEventListener("input", (event) => { searchText = text(event.target.value).toLowerCase(); renderTable(); });
$("#download").addEventListener("click", downloadWorkbook);
$("#reset").addEventListener("click", () => location.reload());

window.BokmooAudit = { minutesFromAmount, datesFromPeriod, analyzeRows };

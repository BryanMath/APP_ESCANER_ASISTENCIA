const STORAGE_KEY = "registro-alumnos-v2";
const COLUMNS = [
  { key: "nombre", label: "Nombre" },
  { key: "matricula", label: "Matrícula" },
  { key: "grupo", label: "Grupo" },
  { key: "lista", label: "Lista" },
  { key: "nickname", label: "Nickname" },
  { key: "plantel", label: "Plantel" }
];
const ALIASES = {
  piloto: "nombre", nombre: "nombre", name: "nombre", alumno: "nombre",
  id_matricula: "matricula", matricula: "matricula", id: "matricula",
  grupo: "grupo",
  rango_lista: "lista", lista: "lista",
  nickname: "nickname", nick: "nickname",
  base: "plantel", plantel: "plantel", escuela: "plantel"
};
const ORDERED_KEYS = ["nombre", "matricula", "grupo", "lista", "nickname", "plantel"];

let students = load();
let draft = null;
let scanner = null;
let scanning = false;
const $ = (id) => document.getElementById(id);

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  render();
}
function uid() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function normKey(key) {
  return String(key || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
function fold(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function apellidoPaterno(nombre) {
  const clean = String(nombre || "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  if (clean.includes(",")) return clean.split(",")[0].trim();
  return clean.split(" ")[0];
}
function byApellido(a, b) {
  const ap = fold(apellidoPaterno(a.nombre)).localeCompare(fold(apellidoPaterno(b.nombre)), "es");
  if (ap) return ap;
  const lista = (parseInt(a.lista, 10) || 9999) - (parseInt(b.lista, 10) || 9999);
  if (lista) return lista;
  return fold(a.nombre).localeCompare(fold(b.nombre), "es");
}
function stamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    iso: date.toISOString(),
    fecha: `${get("day")}/${get("month")}/${get("year")}`,
    hora: `${get("hour")}:${get("minute")}:${get("second")}`,
    day: `${get("year")}-${get("month")}-${get("day")}`
  };
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&" + "amp;";
    if (ch === "<") return "&" + "lt;";
    if (ch === ">") return "&" + "gt;";
    if (ch === '"') return "&" + "quot;";
    return "&" + "#39;";
  });
}
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2800);
}
function personKey(record) {
  return fold(record.matricula || record.nombre || record.id).trim();
}
function slug(value) {
  const clean = fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return clean || "sin-grupo";
}
function selectedGroup() {
  return $("groupFilter").value || "";
}
function selectedDay() {
  return $("dayFilter").value || "";
}
function groupName(value) {
  return value || "SIN GRUPO";
}

function parsePayload(text) {
  const raw = String(text || "").trim();
  const fields = { nombre: "", matricula: "", grupo: "", lista: "", nickname: "", plantel: "" };
  const assign = (key, value) => {
    const mapped = ALIASES[normKey(key)];
    const clean = String(value ?? "").trim().replace(/^["']|["']$/g, "");
    if (mapped && clean) fields[mapped] = mapped === "lista" ? clean.replace(/^#/, "") : clean;
  };
  if (!raw) return { fields, raw };

  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw);
      Object.entries(obj).forEach(([key, value]) => assign(key, value));
      return { fields, raw };
    } catch { /* sigue con texto */ }
  }

  const lines = raw.split(/\r?\n|[|;]/).map((line) => line.trim()).filter(Boolean);
  let labeled = 0;
  lines.forEach((line) => {
    const match = line.match(/^([^:=]{1,40})[:=]\s*(.+)$/);
    if (match) {
      assign(match[1], match[2]);
      labeled += 1;
    }
  });
  if (!labeled) {
    lines.slice(0, ORDERED_KEYS.length).forEach((line, index) => {
      fields[ORDERED_KEYS[index]] = index === 3 ? line.replace(/^#/, "") : line;
    });
  }
  return { fields, raw };
}

function fillGroups() {
  const current = selectedGroup();
  const groups = [...new Set(students.map((student) => student.grupo || ""))].sort((a, b) => fold(a).localeCompare(fold(b), "es"));
  $("groupFilter").innerHTML = `<option value="">Todos los grupos</option>` + groups.map((group) => {
    const label = group || "Sin grupo";
    return `<option value="${escapeHtml(group)}">${escapeHtml(label)}</option>`;
  }).join("");
  $("groupFilter").value = groups.includes(current) || current === "" ? current : "";
}

function visibleStudents() {
  const query = ($("search").value || "").trim().toLowerCase();
  const group = selectedGroup();
  const day = selectedDay();
  return students.filter((student) => {
    if (group && (student.grupo || "") !== group) return false;
    if (day && student.day !== day) return false;
    if (!query) return true;
    return COLUMNS.some((column) => String(student[column.key] || "").toLowerCase().includes(query));
  }).sort(byApellido);
}

function render() {
  fillGroups();
  const day = selectedDay();
  const group = selectedGroup();
  const shown = visibleStudents();
  const inGroup = students.filter((student) => !group || (student.grupo || "") === group);
  $("count").textContent = shown.length;
  $("today").textContent = inGroup.filter((student) => student.day === day).length;
  const latest = [...inGroup].sort((a, b) => String(b.iso || b.day + b.hora).localeCompare(String(a.iso || a.day + a.hora)))[0];
  $("last").textContent = latest ? latest.hora : "—";

  if (!shown.length) {
    $("tableWrap").innerHTML = '<div class="empty">No hay alumnos en esta vista. Escanea el reverso de la credencial o cambia el grupo y el día.</div>';
    return;
  }
  const head = ["#", ...COLUMNS.map((column) => column.label), "Fecha", "Hora", ""].map((cell) => `<th>${cell}</th>`).join("");
  const body = shown.map((student, index) => `
    <tr>
      <td>${index + 1}</td>
      ${COLUMNS.map((column) => `<td>${escapeHtml(student[column.key] || "")}</td>`).join("")}
      <td>${escapeHtml(student.fecha || "")}</td>
      <td>${escapeHtml(student.hora || "")}</td>
      <td class="no-print"><button class="btn danger small" type="button" data-del="${escapeHtml(student.id)}">Quitar</button></td>
    </tr>`).join("");
  $("tableWrap").innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function openForm(parsed, when) {
  draft = { fields: { ...parsed.fields }, raw: parsed.raw || "", when };
  $("formTitle").textContent = parsed.fields.nombre || "Confirmar alumno";
  $("stampPreview").textContent = `Escaneo registrado el ${when.fecha} a las ${when.hora}. Esa hora no cambia aunque tardes en guardar.`;
  const fields = $("fields");
  fields.innerHTML = "";
  COLUMNS.forEach((column) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = column.label;
    const input = document.createElement("input");
    input.type = "text";
    input.dataset.key = column.key;
    input.value = parsed.fields[column.key] || "";
    wrap.append(label, input);
    fields.append(wrap);
  });
  [["Fecha del escaneo", when.fecha], ["Hora del escaneo", when.hora]].forEach(([labelText, value]) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.readOnly = true;
    wrap.append(label, input);
    fields.append(wrap);
  });
  $("formOverlay").classList.add("open");
}

async function startScan() {
  if (scanning) return;
  if (!window.Html5Qrcode) {
    alert("No se encontró el lector de QR dentro de la app. Vuelve a subir la carpeta vendor.");
    return;
  }
  if (!window.isSecureContext) {
    alert("La cámara solo funciona por HTTPS. Ábrela desde GitHub Pages, no como archivo suelto.");
    return;
  }
  $("scanOverlay").classList.add("open");
  scanner = new Html5Qrcode("reader");
  scanning = true;
  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (text) => {
        const when = stamp();
        await stopScan();
        openForm(parsePayload(text), when);
      }
    );
  } catch (error) {
    await stopScan();
    alert("No se pudo abrir la cámara. Permite el acceso o usa Subir foto del QR.\n\n" + error);
  }
}
async function stopScan() {
  $("scanOverlay").classList.remove("open");
  const current = scanner;
  scanner = null;
  scanning = false;
  if (!current) return;
  try { await current.stop(); } catch { /* ya estaba detenido */ }
  try { current.clear(); } catch { /* el lector ya se limpió */ }
}

function rowsFor(list) {
  return [...list].sort(byApellido).map((student, index) => ({
    "#": index + 1,
    Nombre: student.nombre || "",
    Matrícula: student.matricula || "",
    Grupo: student.grupo || "",
    Lista: student.lista || "",
    Nickname: student.nickname || "",
    Plantel: student.plantel || "",
    Fecha: student.fecha || "",
    Hora: student.hora || ""
  }));
}
function downloadBlob(blob, name) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}
function fileBase(kind, group, extra) {
  const name = group === null ? "todos" : groupName(group);
  return `cobach32_${slug(name)}_${kind}_${extra}`;
}
function exportGroup() {
  return selectedGroup() === "" ? null : selectedGroup();
}
function groupsToExport() {
  const group = selectedGroup();
  if (group) return [group];
  const found = [...new Set(students.map((student) => student.grupo || ""))];
  return found.length ? found : [""];
}
function dayRecords(group, day) {
  const seen = new Set();
  return students.filter((student) => {
    if ((student.grupo || "") !== group || student.day !== day) return false;
    const key = personKey(student);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(byApellido);
}
function roster(group) {
  const seen = new Map();
  students.filter((student) => (student.grupo || "") === group).forEach((student) => {
    const key = personKey(student);
    const previous = seen.get(key);
    if (!previous || String(student.day) < String(previous.day)) seen.set(key, student);
    else seen.set(key, { ...student, day: previous.day, fecha: previous.fecha });
  });
  return [...seen.values()].sort(byApellido);
}
function rollDays(group) {
  return [...new Set(students.filter((student) => (student.grupo || "") === group).map((student) => student.day).filter(Boolean))].sort();
}
function wasPresent(group, student, day) {
  const key = personKey(student);
  return students.some((item) => (item.grupo || "") === group && item.day === day && personKey(item) === key);
}

function exportCsv() {
  const day = selectedDay();
  if (!day) return alert("Elige el día de la lista.");
  const chunks = [];
  groupsToExport().forEach((group) => {
    const rows = rowsFor(dayRecords(group, day));
    if (!rows.length) return;
    chunks.push(rows);
  });
  if (!chunks.length) return alert("Ese día no hay alumnos en el grupo elegido.");
  const headers = ["#", "Nombre", "Matrícula", "Grupo", "Lista", "Nickname", "Plantel", "Fecha", "Hora"];
  const lines = [headers.join(",")];
  chunks.flat().forEach((row, index) => {
    row["#"] = index + 1;
    lines.push(headers.map((header) => `"${String(row[header]).replace(/"/g, '""')}"`).join(","));
  });
  const group = selectedGroup();
  downloadBlob(
    new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    `${fileBase("lista", exportGroup(), day)}.csv`
  );
}

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A4A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF149BBA" } } };
  });
}
function styleBody(row, index) {
  row.height = 20;
  row.eachCell((cell, col) => {
    cell.font = { name: "Calibri", size: 11, color: { argb: "FF163040" } };
    cell.alignment = { vertical: "middle", horizontal: col === 2 || col === 7 ? "left" : "center" };
    cell.border = { bottom: { style: "hair", color: { argb: "FFD5E3EA" } } };
    if (index % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4FBFA" } };
    if (col === 3) cell.numFmt = "@";
  });
}
function addTitle(ws, title, subtitle, width) {
  ws.mergeCells(1, 1, 1, width);
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { name: "Calibri", size: 16, bold: true, color: { argb: "FF073044" } };
  ws.getCell(1, 1).alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, width);
  ws.getCell(2, 1).value = subtitle;
  ws.getCell(2, 1).font = { name: "Calibri", size: 10, color: { argb: "FF5E7384" } };
}
function safeSheetName(name, used) {
  const base = String(name || "Sin grupo").replace(/[\\/*?:\[\]]/g, " ").trim().slice(0, 28) || "Sin grupo";
  let next = base;
  let n = 2;
  while (used.has(next)) {
    next = `${base.slice(0, 24)} ${n}`;
    n += 1;
  }
  used.add(next);
  return next;
}

async function exportXlsx() {
  const day = selectedDay();
  if (!day) return alert("Elige el día de la lista.");
  if (!window.ExcelJS) return alert("No se encontró Excel dentro de la app. Vuelve a subir la carpeta vendor.");
  const groups = groupsToExport().filter((group) => dayRecords(group, day).length || roster(group).length);
  if (!groups.length) return alert("Ese día no hay alumnos para exportar.");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro de alumnos";
  const used = new Set();
  const headers = ["#", "Nombre", "Matrícula", "Grupo", "Lista", "Nickname", "Plantel", "Fecha", "Hora"];
  groups.forEach((group) => {
    const present = dayRecords(group, day);
    const ws = wb.addWorksheet(safeSheetName(groupName(group), used), {
      views: [{ state: "frozen", ySplit: 3, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 }
    });
    addTitle(ws, `Lista del ${day.split("-").reverse().join("/")} · ${groupName(group)}`, `COBACH No. 32 · ordenada por apellido paterno · ${present.length} asistencia(s)`, headers.length);
    const headerRow = ws.getRow(3);
    headerRow.values = headers;
    styleHeader(headerRow);
    rowsFor(present).forEach((row, index) => {
      styleBody(ws.addRow(headers.map((header) => row[header])), index);
    });
    ws.columns = [
      { width: 6 }, { width: 36 }, { width: 16 }, { width: 14 }, { width: 10 },
      { width: 18 }, { width: 28 }, { width: 14 }, { width: 14 }
    ];
    ws.autoFilter = { from: "A3", to: "I3" };
    ws.pageSetup.printTitlesRow = "1:3";

    const faltas = wb.addWorksheet(safeSheetName(`${groupName(group)} faltas`, used), {
      views: [{ state: "frozen", ySplit: 3, xSplit: 2, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 }
    });
    const faltasHeaders = ["#", "Nombre", "Matrícula", "Grupo", "Lista", "Estatus"];
    addTitle(faltas, `Pase del ${day.split("-").reverse().join("/")} · ${groupName(group)}`, "Asistencia si se escaneó ese día. Falta solo si el alumno ya estaba en el grupo.", faltasHeaders.length);
    const faltasHeader = faltas.getRow(3);
    faltasHeader.values = faltasHeaders;
    styleHeader(faltasHeader);
    roster(group).forEach((student, index) => {
      const status = wasPresent(group, student, day) ? "Asistencia" : (student.day <= day ? "Falta" : "Aún no estaba");
      const row = faltas.addRow([index + 1, student.nombre || "", student.matricula || "", student.grupo || "", student.lista || "", status]);
      styleBody(row, index);
      row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      row.getCell(3).numFmt = "@";
      const color = status === "Asistencia" ? "FF137A4B" : status === "Falta" ? "FFB4233C" : "FF5E7384";
      row.getCell(6).font = { name: "Calibri", size: 11, bold: true, color: { argb: color } };
    });
    faltas.columns = [{ width: 6 }, { width: 36 }, { width: 16 }, { width: 14 }, { width: 10 }, { width: 18 }];
    faltas.autoFilter = { from: "A3", to: "F3" };
  });
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase("lista", exportGroup(), day)}.xlsx`
  );
}

function reportCsv() {
  const lines = ["Grupo,Nombre,Matrícula,Lista,Día,Estatus"];
  let count = 0;
  groupsToExport().forEach((group) => {
    const days = rollDays(group);
    roster(group).forEach((student) => {
      days.forEach((day) => {
        if (student.day > day) return;
        const status = wasPresent(group, student, day) ? "Asistencia" : "Falta";
        count += 1;
        lines.push([groupName(group), student.nombre || "", student.matricula || "", student.lista || "", day.split("-").reverse().join("/"), status]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
      });
    });
  });
  if (count === 0) return alert("Todavía no hay pases de lista para el reporte.");
  const days = [...new Set(students.filter((student) => !selectedGroup() || (student.grupo || "") === selectedGroup()).map((student) => student.day))].sort();
  downloadBlob(
    new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    `${fileBase("asistencia", exportGroup(), `${days[0]}_a_${days[days.length - 1]}`)}.csv`
  );
}

async function reportXlsx() {
  if (!window.ExcelJS) return alert("No se encontró Excel dentro de la app. Vuelve a subir la carpeta vendor.");
  const groups = groupsToExport().filter((group) => roster(group).length);
  if (!groups.length) return alert("Todavía no hay alumnos para el reporte.");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Registro de alumnos";
  const used = new Set();
  const allDays = [];
  groups.forEach((group) => {
    const days = rollDays(group);
    allDays.push(...days);
    const people = roster(group);
    const headers = ["#", "Nombre", "Matrícula", "Grupo", "Lista", ...days.map((day) => day.split("-").reverse().join("/")), "Asistencias", "Faltas", "%"];
    const ws = wb.addWorksheet(safeSheetName(groupName(group), used), {
      views: [{ state: "frozen", ySplit: 3, xSplit: 2, showGridLines: false }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 }
    });
    addTitle(ws, `Reporte de asistencia · ${groupName(group)}`, "Ordenado por apellido paterno. Un día solo aparece si ese grupo tuvo pase de lista.", headers.length);
    const headerRow = ws.getRow(3);
    headerRow.values = headers;
    styleHeader(headerRow);
    people.forEach((student, index) => {
      let presentes = 0;
      let faltas = 0;
      const marks = days.map((day) => {
        if (student.day > day) return "—";
        if (wasPresent(group, student, day)) {
          presentes += 1;
          return "Asistencia";
        }
        faltas += 1;
        return "Falta";
      });
      const total = presentes + faltas;
      const row = ws.addRow([
        index + 1,
        student.nombre || "",
        student.matricula || "",
        student.grupo || "",
        student.lista || "",
        ...marks,
        presentes,
        faltas,
        total ? `${Math.round((presentes / total) * 100)}%` : "—"
      ]);
      styleBody(row, index);
      row.getCell(2).alignment = { vertical: "middle", horizontal: "left" };
      row.getCell(3).numFmt = "@";
      marks.forEach((mark, markIndex) => {
        const color = mark === "Asistencia" ? "FF137A4B" : mark === "Falta" ? "FFB4233C" : "FF5E7384";
        row.getCell(6 + markIndex).font = { name: "Calibri", size: 11, bold: true, color: { argb: color } };
      });
    });
    ws.columns = [
      { width: 6 }, { width: 36 }, { width: 16 }, { width: 14 }, { width: 10 },
      ...days.map(() => ({ width: 14 })),
      { width: 14 }, { width: 12 }, { width: 8 }
    ];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: headers.length } };
    ws.pageSetup.printTitlesRow = "1:3";
  });
  const uniqueDays = [...new Set(allDays)].sort();
  const extra = uniqueDays.length ? `${uniqueDays[0]}_a_${uniqueDays[uniqueDays.length - 1]}` : stamp().day;
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase("asistencia", exportGroup(), extra)}.xlsx`
  );
}

function bind(id, handler) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", handler);
}

bind("scanBtn", () => startScan());
bind("closeScan", () => stopScan());
bind("fileBtn", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!window.Html5Qrcode) {
    alert("No se encontró el lector de QR dentro de la app.");
    return;
  }
  const reader = new Html5Qrcode("fileReader");
  try {
    const text = await reader.scanFile(file, true);
    openForm(parsePayload(text), stamp());
  } catch {
    alert("No encontré un QR en esa imagen.");
  } finally {
    try { reader.clear(); } catch { /* sin vista que limpiar */ }
  }
});
bind("manualBtn", () => openForm({ fields: { nombre: "", matricula: "", grupo: selectedGroup(), lista: "", nickname: "", plantel: "COBACH No. 32" }, raw: "" }, stamp()));
bind("cancelForm", () => $("formOverlay").classList.remove("open"));
bind("saveBtn", () => {
  if (!draft) return;
  const record = {
    id: uid(),
    fecha: draft.when.fecha,
    hora: draft.when.hora,
    day: draft.when.day,
    iso: draft.when.iso,
    raw: draft.raw || ""
  };
  $("fields").querySelectorAll("input[data-key]").forEach((input) => {
    record[input.dataset.key] = input.value.trim();
  });
  if (!record.nombre && !record.matricula) {
    alert("Falta el nombre o la matrícula.");
    return;
  }
  const dup = students.find((student) => personKey(record) && personKey(student) === personKey(record) && student.day === record.day && (student.grupo || "") === (record.grupo || ""));
  if (dup && !confirm(`${record.nombre || "Este alumno"} ya se registró hoy a las ${dup.hora}. ¿Guardar otro escaneo?`)) return;
  students.unshift(record);
  $("formOverlay").classList.remove("open");
  if (record.grupo) $("groupFilter").value = record.grupo;
  $("dayFilter").value = record.day;
  persist();
  toast(`${record.nombre || "Alumno"} · ${record.grupo || "sin grupo"} · ${record.fecha} ${record.hora}`);
});
$("search").addEventListener("input", render);
$("groupFilter").addEventListener("change", render);
$("dayFilter").addEventListener("change", render);
$("tableWrap").addEventListener("click", (event) => {
  const id = event.target?.dataset?.del;
  if (!id) return;
  students = students.filter((student) => student.id !== id);
  persist();
});
bind("csvBtn", exportCsv);
bind("xlsxBtn", () => exportXlsx().catch((error) => alert("No se pudo crear el Excel.\n\n" + error)));
bind("reportCsvBtn", reportCsv);
bind("reportXlsxBtn", () => reportXlsx().catch((error) => alert("No se pudo crear el reporte.\n\n" + error)));
bind("printBtn", () => window.print());
bind("clearBtn", () => {
  const group = selectedGroup();
  const day = selectedDay();
  const target = students.filter((student) => (!group || (student.grupo || "") === group) && (!day || student.day === day));
  if (!target.length) return;
  const label = `${group ? groupName(group) : "todos los grupos"} del ${day || "todos los días"}`;
  if (confirm(`Esto borra ${target.length} registro(s) de ${label} en este teléfono.`)) {
    const ids = new Set(target.map((student) => student.id));
    students = students.filter((student) => !ids.has(student.id));
    persist();
  }
});

$("dayFilter").value = stamp().day;
render();
$("netStatus").textContent = window.isSecureContext
  ? "Lista en este teléfono. La cámara pide HTTPS."
  : "Ábrela por HTTPS para usar la cámara. El archivo suelto no deja escanear.";

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(() => {
    $("netStatus").textContent = navigator.onLine
      ? "Lista. Ya puede seguir funcionando si se va el internet."
      : "Sin internet: usando la copia guardada en el teléfono.";
  }).catch(() => {
    $("netStatus").textContent = "Abierta. Si falla una descarga, revisa que vendor y app.js estén en GitHub.";
  });
}
window.addEventListener("online", () => { $("netStatus").textContent = "Con internet. Las listas siguen guardadas en este teléfono."; });
window.addEventListener("offline", () => { $("netStatus").textContent = "Sin internet. Puedes consultar y exportar lo que ya está guardado."; });

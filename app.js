const STORAGE_KEY = "timeline-items-v1";
const IMPORT_KEY = "timeline-supabase-imported-v1";
const SUPABASE_URL = "https://fgomaujsdblpzxhnnqrg.supabase.co";
const SUPABASE_KEY = "sb_publishable_JOUqLZDnfGu_yCa6k6FVDQ_AYwpr72i";
const TABLE_NAME = "upcoming_events_items_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

const form = document.querySelector("#item-form");
const nameInput = document.querySelector("#item-name");
const startInput = document.querySelector("#start-date");
const endInput = document.querySelector("#end-date");
const errorOutput = document.querySelector("#form-error");
const itemsContainer = document.querySelector("#items");
const formTitle = document.querySelector("#form-title");
const submitButton = document.querySelector("#submit-button");
const cancelEditButton = document.querySelector("#cancel-edit");
const template = document.querySelector("#item-template");
const connectionStatus = document.querySelector("#connection-status");
const mobileAddButton = document.querySelector("#mobile-add");
const mobileCloseButton = document.querySelector("#mobile-close");

let items = [];
let editingId = null;

// Mobile forms always begin closed, including when a browser restores the page.
closeMobileForm();
window.addEventListener("pageshow", closeMobileForm);

const today = localToday();
startInput.value = dateKey(today);
endInput.min = startInput.value;
document.querySelector("#today-label").textContent = `Today · ${formatDate(today)}`;

form.addEventListener("submit", saveItem);
cancelEditButton.addEventListener("click", () => {
  resetForm();
  closeMobileForm();
});
mobileAddButton.addEventListener("click", () => {
  resetForm();
  openMobileForm();
});
mobileCloseButton.addEventListener("click", closeMobileForm);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMobileForm();
});
startInput.addEventListener("change", () => {
  endInput.min = startInput.value;
  if (endInput.value && endInput.value < startInput.value) endInput.value = startInput.value;
});

renderLoading();
initialize();

function loadLocalItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

async function initialize() {
  try {
    await importLocalItemsOnce();
    await refreshItems();
    setConnectionStatus("Synced");
  } catch (error) {
    console.error(error);
    setConnectionStatus("Connection error", true);
    renderError("Could not load events. Check your internet connection and refresh the page.");
  }
}

async function importLocalItemsOnce() {
  if (localStorage.getItem(IMPORT_KEY)) return;
  const localItems = loadLocalItems();
  if (localItems.length) {
    const rows = localItems.map(item => ({
      id: crypto.randomUUID(),
      name: item.name,
      start_date: item.startDate,
      end_date: item.endDate
    }));
    await request("", { method: "POST", body: JSON.stringify(rows), prefer: "return=minimal" });
  }
  localStorage.setItem(IMPORT_KEY, "true");
}

async function refreshItems() {
  const rows = await request("?select=id,name,start_date,end_date");
  items = rows.map(row => ({
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date
  }));
  render();
}

async function request(query = "", options = {}) {
  const headers = {
    apikey: SUPABASE_KEY,
    "Content-Type": "application/json",
    ...(options.prefer ? { Prefer: options.prefer } : {})
  };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}${query}`, {
    method: options.method || "GET",
    headers,
    body: options.body
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  return response.status === 204 || options.prefer === "return=minimal" ? null : response.json();
}

async function saveItem(event) {
  event.preventDefault();
  errorOutput.textContent = "";

  const candidate = {
    id: editingId || crypto.randomUUID(),
    name: nameInput.value.trim(),
    startDate: startInput.value,
    endDate: endInput.value
  };

  if (!candidate.name || !candidate.startDate || !candidate.endDate) {
    errorOutput.textContent = "Please complete all three fields.";
    return;
  }
  if (candidate.endDate < candidate.startDate) {
    errorOutput.textContent = "End date must be on or after the start date.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = editingId ? "Saving…" : "Adding…";
  try {
    const row = {
      id: candidate.id,
      name: candidate.name,
      start_date: candidate.startDate,
      end_date: candidate.endDate
    };
    if (editingId) {
      await request(`?id=eq.${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        body: JSON.stringify(row),
        prefer: "return=minimal"
      });
    } else {
      await request("", { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
    }
    resetForm();
    closeMobileForm();
    await refreshItems();
    setConnectionStatus("Synced");
  } catch (error) {
    console.error(error);
    errorOutput.textContent = "Could not save this event. Please try again.";
    setConnectionStatus("Connection error", true);
  } finally {
    submitButton.disabled = false;
    if (editingId) submitButton.textContent = "Save changes";
  }
}

function resetForm() {
  editingId = null;
  form.reset();
  startInput.value = dateKey(localToday());
  endInput.min = startInput.value;
  formTitle.textContent = "Add an item";
  submitButton.textContent = "Add item";
  cancelEditButton.hidden = true;
  errorOutput.textContent = "";
}

function beginEdit(item) {
  editingId = item.id;
  nameInput.value = item.name;
  startInput.value = item.startDate;
  endInput.min = item.startDate;
  endInput.value = item.endDate;
  formTitle.textContent = "Edit item";
  submitButton.textContent = "Save changes";
  cancelEditButton.hidden = false;
  nameInput.focus();
  openMobileForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openMobileForm() {
  if (window.matchMedia("(max-width: 760px)").matches) {
    document.body.classList.add("form-open");
    window.setTimeout(() => nameInput.focus(), 0);
  }
}

function closeMobileForm() {
  document.body.classList.remove("form-open");
}

async function deleteItem(item) {
  if (!window.confirm(`Delete “${item.name}”?`)) return;
  try {
    await request(`?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE", prefer: "return=minimal" });
    if (editingId === item.id) resetForm();
    await refreshItems();
    setConnectionStatus("Synced");
  } catch (error) {
    console.error(error);
    setConnectionStatus("Delete failed", true);
    window.alert("Could not delete this event. Please try again.");
  }
}

function setConnectionStatus(message, isError = false) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle("error", isError);
}

function renderLoading() {
  itemsContainer.innerHTML = '<div class="empty-state"><h3>Loading events…</h3></div>';
}

function renderError(message) {
  itemsContainer.replaceChildren();
  const error = document.createElement("div");
  error.className = "empty-state";
  const heading = document.createElement("h3");
  heading.textContent = "Events unavailable";
  const detail = document.createElement("p");
  detail.textContent = message;
  error.append(heading, detail);
  itemsContainer.append(error);
}

function render() {
  itemsContainer.replaceChildren();
  const sortedItems = [...items].sort((a, b) =>
    parseDate(a.endDate).getTime() - parseDate(b.endDate).getTime()
      || a.name.localeCompare(b.name)
  );

  if (!sortedItems.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "<h3>No items yet</h3><p>Add your first item using the form on the left.</p>";
    itemsContainer.append(empty);
    return;
  }

  sortedItems.forEach(item => itemsContainer.append(renderItem(item)));
}

function renderItem(item) {
  const card = template.content.firstElementChild.cloneNode(true);
  const timeline = card.querySelector(".timeline");
  const end = parseDate(item.endDate);
  const current = localToday();
  const daysToEnd = Math.round((end - current) / DAY_MS);
  const dayLabel = daysToEnd >= 0
    ? `${daysToEnd} ${daysToEnd === 1 ? "day" : "days"} left`
    : `${Math.abs(daysToEnd)} ${daysToEnd === -1 ? "day" : "days"} past`;

  const title = card.querySelector(".card-title");
  title.append(document.createTextNode(`${item.name} `));
  const count = document.createElement("span");
  count.className = "days-count";
  count.textContent = `· ${dayLabel}`;
  title.append(count);
  const mobileEndDate = document.createElement("span");
  mobileEndDate.className = "end-date-mobile";
  mobileEndDate.textContent = ` · ${formatCompactDate(end)}`;
  title.append(mobileEndDate);
  card.querySelector(".edit-button").addEventListener("click", () => beginEdit(item));
  card.querySelector(".delete-button").addEventListener("click", () => deleteItem(item));

  if (end < current) {
    const message = document.createElement("p");
    message.className = "past-message";
    message.textContent = "This item has ended.";
    timeline.replaceWith(message);
    return card;
  }

  for (let cursor = current; cursor <= end; cursor = addDays(cursor, 1)) {
    if (cursor.getDate() === 1) {
      const month = document.createElement("div");
      month.className = "month-cell";
      month.setAttribute("role", "listitem");
      month.textContent = cursor.toLocaleDateString(undefined, { month: "short" }).charAt(0);
      month.title = cursor.toLocaleDateString(undefined, { month: "long" });
      timeline.append(month);
    }

    const daysLeft = Math.round((end - cursor) / DAY_MS);
    const cell = document.createElement("div");
    cell.className = `date-cell ${daysLeft < 2 ? "red" : daysLeft <= 10 ? "yellow" : "green"}`;
    cell.setAttribute("role", "listitem");
    cell.textContent = cursor.getDate();
    cell.title = cursor.toLocaleDateString(undefined, { weekday: "short" });
    timeline.append(cell);
  }
  return card;
}

function localToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

function formatDate(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCompactDate(date) {
  const months = ["Jan.", "Feb.", "Mar.", "Apr.", "May.", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
  return `${months[date.getMonth()]} ${String(date.getDate()).padStart(2, "0")}`;
}

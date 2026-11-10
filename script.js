// ---------- Elements ----------
const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spinBtn");
const resultEl = document.getElementById("result");
const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const formError = document.getElementById("formError");
const taskList = document.getElementById("taskList");
const taskCount = document.getElementById("taskCount");
const emptyMessage = document.getElementById("emptyMessage");
const resetBtn = document.getElementById("resetBtn");

// ---------- State ----------
const STORAGE_KEY = "random-task-spinner:tasks";
const COLORS = [
  "#5b5bf0", "#f25f5c", "#ffb627", "#2ec4b6",
  "#9b5de5", "#f15bb5", "#00a6fb", "#7ac74f",
  "#ff8c42", "#3d5a80",
];
const SPIN_DURATION = 5000; // keep in sync with the CSS transition

let tasks = loadTasks();
let rotation = 0; // total degrees the wheel has turned (clockwise)
let isSpinning = false;

// ---------- Storage ----------
function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // Storage unavailable (private mode etc.). The app still works without it.
  }
}

// ---------- Helpers ----------
function colorFor(index) {
  // Avoid the last slice having the same color as the first one
  if (tasks.length > 1 && index === tasks.length - 1 && index % COLORS.length === 0) {
    return COLORS[1];
  }
  return COLORS[index % COLORS.length];
}

// Shorten text with "…" so it fits the given width
function fitText(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(trimmed + "…").width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed + "…";
}

// ---------- Drawing ----------
// Slices are drawn clockwise starting from the top (12 o'clock),
// so slice i covers [i * sliceDeg, (i + 1) * sliceDeg] measured from the top.
function drawWheel() {
  const size = 500; // drawing units; the canvas is 2x for sharp text on HiDPI screens
  ctx.setTransform(canvas.width / size, 0, 0, canvas.height / size, 0, 0);
  const center = size / 2;
  const radius = center - 4;

  ctx.clearRect(0, 0, size, size);

  if (tasks.length === 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#e9eaf3";
    ctx.fill();
    ctx.fillStyle = "#9a9db3";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Add tasks to spin", center, center + radius * 0.55);
    return;
  }

  const sliceRad = (Math.PI * 2) / tasks.length;
  const startOffset = -Math.PI / 2; // start at the top

  tasks.forEach((task, i) => {
    const start = startOffset + i * sliceRad;
    const end = start + sliceRad;

    // Slice
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = colorFor(i);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = tasks.length > 1 ? 3 : 0;
    if (tasks.length > 1) ctx.stroke();

    // Label, written along the middle of the slice
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(start + sliceRad / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const fontSize = tasks.length > 12 ? 15 : 19;
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = 3;
    const maxWidth = radius * 0.62; // leave room for the Spin button in the middle
    ctx.fillText(fitText(task, maxWidth), radius - 18, 0);
    ctx.restore();
  });
}

// ---------- Task list ----------
function render(newIndex = -1) {
  taskList.innerHTML = "";

  tasks.forEach((task, i) => {
    const li = document.createElement("li");
    li.className = i === newIndex ? "task-item is-new" : "task-item";

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = colorFor(i);

    const name = document.createElement("span");
    name.className = "task-name";
    name.textContent = task;

    const remove = document.createElement("button");
    remove.className = "remove-btn";
    remove.type = "button";
    remove.innerHTML = "&times;";
    remove.setAttribute("aria-label", `Remove ${task}`);
    remove.disabled = isSpinning;
    remove.addEventListener("click", () => removeTask(i));

    li.append(swatch, name, remove);
    taskList.appendChild(li);
  });

  taskCount.textContent = tasks.length;
  emptyMessage.hidden = tasks.length > 0;
  spinBtn.disabled = isSpinning || tasks.length === 0;
  resetBtn.disabled = isSpinning || tasks.length === 0;

  drawWheel();
}

function addTask(text) {
  const task = text.trim().replace(/\s+/g, " ");

  if (!task) {
    formError.textContent = "Please enter a task first.";
    taskInput.focus();
    return;
  }

  formError.textContent = "";
  tasks.push(task);
  saveTasks();
  taskInput.value = "";
  taskInput.focus();
  render(tasks.length - 1);

  if (tasks.length === 1) {
    resultEl.textContent = "Add another task or hit Spin!";
  }
}

function removeTask(index) {
  if (isSpinning) return;
  tasks.splice(index, 1);
  saveTasks();
  clearResult();
  render();
}

function resetTasks() {
  if (isSpinning || tasks.length === 0) return;
  if (!confirm("Remove all tasks?")) return;
  tasks = [];
  saveTasks();
  clearResult();
  render();
}

function clearResult() {
  resultEl.classList.remove("win");
  resultEl.textContent = tasks.length
    ? "Hit Spin to pick a task."
    : "Add a few tasks to get started.";
}

// ---------- Spinning ----------
// Work out which slice is under the top pointer for a given rotation.
// Rotating the wheel clockwise by R degrees brings the point that sits
// at (360 - R) degrees on the wheel up to the pointer.
function indexAtPointer(totalRotation) {
  const sliceDeg = 360 / tasks.length;
  const angleOnWheel = (360 - (totalRotation % 360)) % 360;
  return Math.floor(angleOnWheel / sliceDeg);
}

function spin() {
  if (isSpinning || tasks.length === 0) return;

  isSpinning = true;
  render();
  resultEl.classList.remove("win");
  resultEl.textContent = "Spinning…";
  document.querySelectorAll(".task-item.selected").forEach((el) => el.classList.remove("selected"));

  const sliceDeg = 360 / tasks.length;
  const winner = Math.floor(Math.random() * tasks.length);

  // Land somewhere inside the winning slice, away from its edges
  const landingAngle = winner * sliceDeg + sliceDeg * (0.15 + Math.random() * 0.7);

  // Rotation (mod 360) needed to bring landingAngle to the pointer
  const targetMod = (360 - landingAngle) % 360;
  const currentMod = rotation % 360;
  const extraSpins = 5 + Math.floor(Math.random() * 3); // 5–7 full turns
  rotation += extraSpins * 360 + ((targetMod - currentMod + 360) % 360);

  canvas.style.transform = `rotate(${rotation}deg)`;

  // Wait for the CSS transition; the timeout is a fallback if transitionend never fires
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    canvas.removeEventListener("transitionend", finish);
    onSpinEnd();
  };
  canvas.addEventListener("transitionend", finish);
  setTimeout(finish, SPIN_DURATION + 200);
}

function onSpinEnd() {
  isSpinning = false;

  // Read the result from the wheel's final position, so it always matches the pointer
  const index = indexAtPointer(rotation);
  const task = tasks[index];

  resultEl.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = "Your task is";
  const strong = document.createElement("strong");
  strong.textContent = task;
  resultEl.append(label, strong);
  resultEl.classList.add("win");

  render();
  taskList.children[index]?.classList.add("selected");
}

// ---------- Events ----------
taskForm.addEventListener("submit", (e) => {
  e.preventDefault(); // Enter key submits the form too
  addTask(taskInput.value);
});

taskInput.addEventListener("input", () => {
  if (taskInput.value.trim()) formError.textContent = "";
});

spinBtn.addEventListener("click", spin);
resetBtn.addEventListener("click", resetTasks);

// ---------- Init ----------
render();
clearResult();

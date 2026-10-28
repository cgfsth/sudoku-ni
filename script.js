"use strict";

const SIZE = 9;
const BOX = 3;
const boardElement = document.querySelector("#board");
const difficultySelect = document.querySelector("#difficulty");
const toastElement = document.querySelector("#toast");
const themeToggle = document.querySelector("#theme-toggle");
const toast = (message, kind = "") => {
  toastElement.textContent = message;
  toastElement.className = `toast visible ${kind}`.trim();
  window.clearTimeout(toast.timeoutId);
  toast.timeoutId = window.setTimeout(() => {
    toastElement.className = "toast";
  }, 2500);
};

function setTheme(theme) {
  const isDark = theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} mode`);
  themeToggle.title = `Switch to ${isDark ? "light" : "dark"} mode`;
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.querySelector(".theme-toggle-icon").textContent = isDark ? "☀" : "☾";
  themeToggle.querySelector(".theme-toggle-label").textContent = isDark ? "Light mode" : "Dark mode";
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#211a17" : "#f4ede2";
  window.localStorage.setItem("sudoku-ni-theme", isDark ? "dark" : "light");
}

const savedTheme = window.localStorage.getItem("sudoku-ni-theme");
setTheme(savedTheme === "dark" ? "dark" : "light");
themeToggle.addEventListener("click", () => {
  setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
});

const shuffle = (items) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

function makeSolution() {
  const bands = shuffle([0, 1, 2]);
  const stacks = shuffle([0, 1, 2]);
  const rows = bands.flatMap((band) => shuffle([0, 1, 2]).map((row) => band * 3 + row));
  const columns = stacks.flatMap((stack) => shuffle([0, 1, 2]).map((column) => stack * 3 + column));
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const transpose = Math.random() < 0.5;

  return rows.map((row) => columns.map((column) => {
    const r = transpose ? column : row;
    const c = transpose ? row : column;
    const pattern = (r * BOX + Math.floor(r / BOX) + c) % SIZE;
    return digits[pattern];
  }));
}

function countSolutions(board, limit = 2) {
  let bestRow = -1;
  let bestColumn = -1;
  let bestCandidates = null;
  let smallestCandidateCount = SIZE + 1;

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (board[row][column] !== 0) continue;
      const used = new Set();
      for (let i = 0; i < SIZE; i += 1) {
        used.add(board[row][i]);
        used.add(board[i][column]);
      }
      const boxRow = Math.floor(row / BOX) * BOX;
      const boxColumn = Math.floor(column / BOX) * BOX;
      for (let r = boxRow; r < boxRow + BOX; r += 1) {
        for (let c = boxColumn; c < boxColumn + BOX; c += 1) used.add(board[r][c]);
      }
      const candidates = [];
      for (let value = 1; value <= SIZE; value += 1) {
        if (!used.has(value)) candidates.push(value);
      }
      if (candidates.length === 0) return 0;
      if (candidates.length < smallestCandidateCount) {
        bestRow = row;
        bestColumn = column;
        bestCandidates = candidates;
        smallestCandidateCount = candidates.length;
        if (smallestCandidateCount === 1) break;
      }
    }
    if (smallestCandidateCount === 1) break;
  }

  if (bestRow === -1) return 1;
  let solutions = 0;
  for (const value of bestCandidates) {
    board[bestRow][bestColumn] = value;
    solutions += countSolutions(board, limit - solutions);
    board[bestRow][bestColumn] = 0;
    if (solutions >= limit) return solutions;
  }
  return solutions;
}

function makePuzzle(difficulty) {
  const solution = makeSolution();
  const puzzle = solution.map((row) => [...row]);
  const targetClues = { easy: 40, medium: 34, hard: 29 }[difficulty];
  const positions = shuffle(Array.from({ length: 81 }, (_, index) => index));
  let clues = 81;

  for (const position of positions) {
    if (clues <= targetClues) break;
    const row = Math.floor(position / SIZE);
    const column = position % SIZE;
    const original = puzzle[row][column];
    puzzle[row][column] = 0;
    if (countSolutions(puzzle.map((line) => [...line])) === 1) {
      clues -= 1;
    } else {
      puzzle[row][column] = original;
    }
  }
  return { puzzle, solution };
}

let puzzle;
let solution;
let values;
let notes;
let fixed;
let selected = null;
let noteMode = false;
let paused = false;
let finished = false;
let mistakes = 0;
let hintsRemaining = 10;
let seconds = 0;
let timerInterval;
let checkedErrors = new Set();
let gameStarted = false;

function startTimer() {
  window.clearInterval(timerInterval);
  timerInterval = window.setInterval(() => {
    if (!paused && !finished) {
      seconds += 1;
      updateTimer();
    }
  }, 1000);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function updateTimer() {
  document.querySelector("#timer").textContent = formatTime(seconds);
}

function cellIndex(row, column) {
  return row * SIZE + column;
}

function renderBoard() {
  boardElement.replaceChildren();
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const index = cellIndex(row, column);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, empty`);
      cell.addEventListener("click", () => selectCell(row, column));
      boardElement.append(cell);
    }
  }
  updateBoard();
}

function hasConflict(row, column, value) {
  for (let index = 0; index < SIZE; index += 1) {
    if (index !== column && values[row][index] === value) return true;
    if (index !== row && values[index][column] === value) return true;
  }
  const boxRow = Math.floor(row / BOX) * BOX;
  const boxColumn = Math.floor(column / BOX) * BOX;
  for (let r = boxRow; r < boxRow + BOX; r += 1) {
    for (let c = boxColumn; c < boxColumn + BOX; c += 1) {
      if ((r !== row || c !== column) && values[r][c] === value) return true;
    }
  }
  return false;
}

function updateBoard() {
  const selectedValue = selected ? values[selected.row][selected.column] : 0;
  const cells = boardElement.children;

  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      const index = cellIndex(row, column);
      const cell = cells[index];
      const value = values[row][column];
      const isSelected = selected?.row === row && selected?.column === column;
      const isRelated = selected && (
        selected.row === row ||
        selected.column === column ||
        (Math.floor(selected.row / BOX) === Math.floor(row / BOX) &&
          Math.floor(selected.column / BOX) === Math.floor(column / BOX))
      );
      const isGiven = fixed[row][column];
      const hasError = checkedErrors.has(index) || (value !== 0 && hasConflict(row, column, value));

      cell.className = "cell";
      if (isGiven) cell.classList.add("given");
      else if (value !== 0) cell.classList.add("user-entry");
      if (isRelated && !isSelected) cell.classList.add("related");
      if (selectedValue !== 0 && value === selectedValue) cell.classList.add("same-number");
      if (isSelected) cell.classList.add("selected");
      if (hasError) cell.classList.add("error");
      cell.disabled = paused || finished;
      cell.replaceChildren();

      if (value !== 0) {
        cell.textContent = String(value);
        cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, ${value}${isGiven ? ", given" : ""}${hasError ? ", conflict" : ""}`);
      } else {
        const cellNotes = notes[row][column];
        if (cellNotes.size) {
          const noteGrid = document.createElement("span");
          noteGrid.className = "cell-notes";
          noteGrid.setAttribute("aria-hidden", "true");
          for (let number = 1; number <= SIZE; number += 1) {
            const note = document.createElement("span");
            note.textContent = cellNotes.has(number) ? String(number) : "";
            noteGrid.append(note);
          }
          cell.append(noteGrid);
        }
        cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}, empty`);
      }
      if (noteMode && !isGiven) cell.classList.add("note-mode");
    }
  }
  updateProgress();
  updateNumberPad();
}

function updateProgress() {
  const filled = values.flat().filter((value) => value !== 0).length;
  const progress = document.querySelector("#progress-fill").parentElement;
  document.querySelector("#progress-count").textContent = `${filled} / 81`;
  document.querySelector("#progress-fill").style.width = `${(filled / 81) * 100}%`;
  progress.setAttribute("aria-valuenow", String(filled));
  document.querySelector("#mistakes").textContent = String(mistakes);
  document.querySelector("#guide-hint-count").textContent = `${hintsRemaining} ${hintsRemaining === 1 ? "hint" : "hints"}`;
  document.querySelector("#guide-hint-button").disabled = finished || paused;
  document.querySelector("#check-button").disabled = finished || paused;
  document.querySelector("#guide-check-button").disabled = finished || paused;
}

function updateNumberPad() {
  const activeCell = selected && !fixed[selected.row][selected.column] && !finished && !paused;
  document.querySelectorAll("#number-pad [data-number]").forEach((button) => {
    button.disabled = !activeCell;
  });
  document.querySelector("#guide-erase-button").disabled = !activeCell ||
    (values[selected.row][selected.column] === 0 && notes[selected.row][selected.column].size === 0);
}

function selectCell(row, column) {
  if (paused || finished) return;
  selected = { row, column };
  document.querySelector("#selection-help").textContent = noteMode
    ? "Notes are on. Add or remove a possibility."
    : "Choose a square, then enter a number.";
  updateBoard();
}

function updateNotesForPlacement(row, column, value) {
  notes[row][column].clear();
  const boxRow = Math.floor(row / BOX) * BOX;
  const boxColumn = Math.floor(column / BOX) * BOX;
  for (let index = 0; index < SIZE; index += 1) {
    notes[row][index].delete(value);
    notes[index][column].delete(value);
  }
  for (let r = boxRow; r < boxRow + BOX; r += 1) {
    for (let c = boxColumn; c < boxColumn + BOX; c += 1) notes[r][c].delete(value);
  }
}

function enterNumber(value) {
  if (!selected || paused || finished || fixed[selected.row][selected.column]) return;
  const { row, column } = selected;
  if (noteMode) {
    const cellNotes = notes[row][column];
    if (cellNotes.has(value)) cellNotes.delete(value);
    else cellNotes.add(value);
    updateBoard();
    return;
  }

  const previous = values[row][column];
  if (previous === value) return;
  values[row][column] = value;
  notes[row][column].clear();
  checkedErrors.delete(cellIndex(row, column));

  if (value !== solution[row][column]) {
    mistakes += 1;
    if (mistakes === 3) toast("Three mistakes. Take a breath and check your board.");
  }

  updateNotesForPlacement(row, column, value);
  updateBoard();
  if (values.every((line, r) => line.every((number, c) => number === solution[r][c]))) winGame();
}

function eraseSelected() {
  if (!selected || paused || finished || fixed[selected.row][selected.column]) return;
  if (values[selected.row][selected.column] === 0 && notes[selected.row][selected.column].size === 0) return;
  values[selected.row][selected.column] = 0;
  notes[selected.row][selected.column].clear();
  checkedErrors.delete(cellIndex(selected.row, selected.column));
  updateBoard();
}

function checkBoard() {
  if (finished || paused) return;
  checkedErrors = new Set();
  let wrongCount = 0;
  values.forEach((row, r) => row.forEach((value, c) => {
    if (value !== 0 && value !== solution[r][c]) {
      checkedErrors.add(cellIndex(r, c));
      wrongCount += 1;
    }
  }));
  updateBoard();
  if (wrongCount) toast(`${wrongCount} ${wrongCount === 1 ? "square needs" : "squares need"} another look.`);
  else toast("Looking good. Keep going!", "success");
}

function useHint() {
  if (finished || paused) return;
  if (hintsRemaining < 1) {
    toast("You're out of hints.");
    return;
  }
  const emptyCells = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let column = 0; column < SIZE; column += 1) {
      if (values[row][column] !== solution[row][column] && !fixed[row][column]) {
        emptyCells.push({ row, column });
      }
    }
  }
  if (emptyCells.length === 0) return;
  const target = selected && values[selected.row][selected.column] !== solution[selected.row][selected.column]
    ? selected
    : emptyCells[Math.floor(Math.random() * emptyCells.length)];
  selected = target;
  values[target.row][target.column] = solution[target.row][target.column];
  notes[target.row][target.column].clear();
  updateNotesForPlacement(target.row, target.column, values[target.row][target.column]);
  hintsRemaining -= 1;
  checkedErrors.delete(cellIndex(target.row, target.column));
  updateBoard();
  toast("A little clarity, right where you needed it.", "success");
  if (values.every((line, r) => line.every((number, c) => number === solution[r][c]))) winGame();
}

function winGame() {
  finished = true;
  window.clearInterval(timerInterval);
  updateBoard();
  toast(`Beautifully done. You found your flow in ${formatTime(seconds)}.`, "success");
}

function togglePause(forcePaused) {
  if (finished) return;
  paused = typeof forcePaused === "boolean" ? forcePaused : !paused;
  document.querySelector("#pause-overlay").hidden = !paused;
  document.querySelector("#pause-button").textContent = paused ? "▶" : "Ⅱ";
  document.querySelector("#pause-button").setAttribute("aria-label", paused ? "Resume game" : "Pause game");
  updateBoard();
}

function newGame(difficulty = difficultySelect.value) {
  difficultySelect.value = difficulty;
  const generated = makePuzzle(difficulty);
  puzzle = generated.puzzle;
  solution = generated.solution;
  values = puzzle.map((row) => [...row]);
  notes = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => new Set()));
  fixed = puzzle.map((row) => row.map((value) => value !== 0));
  selected = null;
  noteMode = false;
  paused = false;
  finished = false;
  mistakes = 0;
  hintsRemaining = 10;
  seconds = 0;
  checkedErrors = new Set();
  document.querySelector("#notes-button").setAttribute("aria-pressed", "false");
  document.querySelector("#selection-help").textContent = "Choose a square, then enter a number.";
  document.querySelector("#pause-overlay").hidden = true;
  document.querySelector("#pause-button").textContent = "Ⅱ";
  document.querySelector("#pause-button").setAttribute("aria-label", "Pause game");
  updateTimer();
  renderBoard();
  startTimer();
}

document.querySelector("#number-pad").addEventListener("click", (event) => {
  const button = event.target.closest("[data-number]");
  if (button) enterNumber(Number(button.dataset.number));
});
document.querySelector("#guide-erase-button").addEventListener("click", eraseSelected);
document.querySelector("#guide-hint-button").addEventListener("click", useHint);
document.querySelector("#guide-check-button").addEventListener("click", checkBoard);
document.querySelector("#check-button").addEventListener("click", checkBoard);
document.querySelector("#pause-button").addEventListener("click", () => togglePause());
document.querySelector("#resume-button").addEventListener("click", () => togglePause(false));
document.querySelector("#notes-button").addEventListener("click", () => {
  noteMode = !noteMode;
  document.querySelector("#notes-button").setAttribute("aria-pressed", String(noteMode));
  document.querySelector("#selection-help").textContent = noteMode
    ? "Notes are on. Add or remove a possibility."
    : "Choose a square, then enter a number.";
  updateBoard();
});
document.querySelector("#new-game-top").addEventListener("click", (event) => {
  event.preventDefault();
  newGame();
});
document.querySelector("#play-button").addEventListener("click", () => {
  document.querySelector("#home-screen").hidden = true;
  document.querySelector("#game-screen").hidden = false;
  document.querySelector("#new-game-top").hidden = false;
  newGame("easy");
  gameStarted = true;
});
document.querySelector("#home-link").addEventListener("click", (event) => {
  event.preventDefault();
  if (gameStarted && !paused && !finished) togglePause(true);
  document.querySelector("#game-screen").hidden = true;
  document.querySelector("#home-screen").hidden = false;
  document.querySelector("#new-game-top").hidden = true;
});
difficultySelect.addEventListener("change", () => newGame(difficultySelect.value));

document.addEventListener("keydown", (event) => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.matches("input, select, textarea")) return;
  if (/^[1-9]$/.test(event.key)) {
    enterNumber(Number(event.key));
    return;
  }
  if (event.key.toLowerCase() === "n") {
    document.querySelector("#notes-button").click();
    return;
  }
  if (event.key === "Backspace" || event.key === "Delete") {
    eraseSelected();
    return;
  }
  if (!selected || paused || finished) return;
  const directions = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const direction = directions[event.key];
  if (direction) {
    event.preventDefault();
    let row = selected.row;
    let column = selected.column;
    for (let attempt = 0; attempt < SIZE * SIZE; attempt += 1) {
      row = (row + direction[0] + SIZE) % SIZE;
      column = (column + direction[1] + SIZE) % SIZE;
      if (!fixed[row][column]) {
        selectCell(row, column);
        boardElement.children[cellIndex(row, column)].focus();
        return;
      }
    }
  }
});

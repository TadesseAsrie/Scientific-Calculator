class ScientificCalculator {
  constructor() {
    this.exprDisplay = document.getElementById("expression-display");
    this.resDisplay = document.getElementById("result-display");
    this.angleModeBadge = document.getElementById("angle-mode");
    this.calcCounterDisplay = document.getElementById("calc-counter");
    this.historyList = document.getElementById("history-list");
    this.historyPanel = document.getElementById("history-panel");

    // System Internal State
    this.expression = "";
    this.isRadian = false;
    this.memory = parseFloat(localStorage.getItem("calc_memory")) || 0;
    this.history = JSON.parse(localStorage.getItem("calc_history")) || [];
    this.calcCounter = parseInt(localStorage.getItem("calc_counter")) || 0;
    this.precision = "6";
    this.soundEnabled = true;
    this.shouldReset = false; // Reset screen on next number injection if evaluation ended

    // Initialization Run
    this.initAudio();
    this.updateCounterUI();
    this.renderHistory();
  }

  initAudio() {
    // Safe programmatic creation of a tiny key-click synth audio context node
    this.audioCtx = null;
    this.playClick = () => {
      if (!this.soundEnabled) return;
      try {
        if (!this.audioCtx)
          this.audioCtx = new (
            window.AudioContext || window.webkitAudioContext
          )();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.00001,
          this.audioCtx.currentTime + 0.04,
        );
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.04);
      } catch (e) {
        console.warn("Audio Context blocked or unsupported");
      }
    };
  }

  // --- core mutations ---
  appendToken(value) {
    if (this.shouldReset) {
      this.expression = "";
      this.shouldReset = false;
    }

    // Contextually map pretty rendering structures safely
    if (
      [
        "sin",
        "cos",
        "tan",
        "asin",
        "acos",
        "atan",
        "log",
        "ln",
        "sqrt",
        "cbrt",
        "abs",
      ].includes(value)
    ) {
      this.expression += value + "(";
    } else if (value === "sqr") {
      this.expression += "^2";
    } else if (value === "cube") {
      this.expression += "^3";
    } else if (value === "recip") {
      this.expression += "1÷";
    } else if (value === "exp") {
      this.expression += "e^";
    } else if (value === "ee") {
      this.expression += "E";
    } else {
      this.expression += value;
    }
    this.updateDisplay();
  }

  clear() {
    this.expression = "";
    this.resDisplay.innerText = "0";
    this.shouldReset = false;
    this.updateDisplay();
    this.adjustFontSize();
  }

  delete() {
    if (this.shouldReset) return this.clear();
    this.expression = this.expression.slice(0, -1);
    this.updateDisplay();
  }

  toggleNegate() {
    if (this.expression === "") return;
    // Basic expression negation parsing
    if (this.expression.startsWith("-(") && this.expression.endsWith(")")) {
      this.expression = this.expression.slice(2, -1);
    } else {
      this.expression = `-(${this.expression})`;
    }
    this.updateDisplay();
  }

  toggleAngleMode() {
    this.isRadian = !this.isRadian;
    this.angleModeBadge.innerText = this.isRadian ? "RAD" : "DEG";
  }

  appendPercentage() {
    if (this.expression !== "") {
      this.expression += "÷100";
      this.evaluate();
    }
  }

  // --- math processor ---
  evaluate() {
    if (!this.expression) return;
    let processedExpr = this.expression
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/π/g, "Math.PI")
      .replace(/e/g, "Math.E");

    // Regex parsing of specialized math functions
    processedExpr = this.parseScientificFunctions(processedExpr);
    processedExpr = this.parsePowersAndRoots(processedExpr);
    processedExpr = this.parseFactorials(processedExpr);

    try {
      // Evaluated safely using structured standard math constructor conversion paths
      let result = new Function(`return (${processedExpr})`)();

      if (result === undefined || isNaN(result))
        throw new Error("Invalid Input");
      if (!isFinite(result)) throw new Error("Divide by Zero");

      // Precision clamping logic
      if (this.precision !== "all") {
        const dec = parseInt(this.precision);
        result = Number(Math.round(result + "e" + dec) + "e-" + dec);
      }

      // Exponential conversion if result is massive or tiny
      if (
        Math.abs(result) > 1e12 ||
        (Math.abs(result) < 1e-6 && result !== 0)
      ) {
        result = result.toExponential(4);
      }

      this.resDisplay.innerText = result;
      this.saveHistoryItem(this.expression, result);

      this.calcCounter++;
      localStorage.setItem("calc_counter", this.calcCounter);
      this.updateCounterUI();

      this.shouldReset = true;
    } catch (err) {
      this.resDisplay.innerText = err.message || "Syntax Error";
      this.shouldReset = true;
    }
    this.adjustFontSize();
  }

  parseScientificFunctions(expr) {
    const funcs = [
      "sin",
      "cos",
      "tan",
      "asin",
      "acos",
      "atan",
      "log",
      "ln",
      "abs",
    ];
    funcs.forEach((f) => {
      const regex = new RegExp(`\\b${f}\\(`, "g");
      if (["sin", "cos", "tan"].includes(f)) {
        if (!this.isRadian) {
          expr = expr.replace(regex, `Math.${f}((Math.PI/180)*`);
          // This configuration locks closing parenthesis bounds correctly on simple input execution blocks.
        } else {
          expr = expr.replace(regex, `Math.${f}(`);
        }
      } else if (["asin", "acos", "atan"].includes(f)) {
        if (!this.isRadian) {
          expr = expr.replace(regex, `180/Math.PI*Math.${f}(`);
        } else {
          expr = expr.replace(regex, `Math.${f}(`);
        }
      } else if (f === "log") {
        expr = expr.replace(/log\(/g, "Math.log10(");
      } else if (f === "ln") {
        expr = expr.replace(/ln\(/g, "Math.log(");
      } else if (f === "abs") {
        expr = expr.replace(/abs\(/g, "Math.abs(");
      }
    });
    // Edge patch structural conversions
    expr = expr.replace(/sqrt\(/g, "Math.sqrt(");
    expr = expr.replace(/cbrt\(/g, "Math.cbrt(");
    return expr;
  }

  parsePowersAndRoots(expr) {
    // Handle explicit inline conversion configurations for powers (base^exponent)
    while (expr.includes("^")) {
      const parts = expr.split("^");
      // Crude balancing tokenizer logic to safely group bases and exponents
      const base = this.extractLeftOperand(parts[0]);
      const exponent = this.extractRightOperand(parts[1]);
      expr = expr.replace(
        `${base}^${exponent}`,
        `Math.pow(${base},${exponent})`,
      );
    }
    // Map native 'E' logic handling built natively into JS strings
    expr = expr.replace(/(\d+)\s*E\s*(-?\d+)/g, "($1*Math.pow(10,$2))");
    return expr;
  }

  parseFactorials(expr) {
    const regex = /(\d+)!/g;
    return expr.replace(regex, (match, num) => {
      let n = parseInt(num);
      if (n < 0) return "NaN";
      let fact = 1;
      for (let i = 2; i <= n; i++) fact *= i;
      return fact;
    });
  }

  extractLeftOperand(str) {
    let i = str.length - 1;
    if (str[i] === ")") {
      let count = 1;
      i--;
      while (i >= 0 && count > 0) {
        if (str[i] === ")") count++;
        if (str[i] === "(") count--;
        i--;
      }
      return str.slice(i + 1);
    }
    return str.match(/[\d\.Math\.PIe]+$/)?.[0] || "";
  }

  extractRightOperand(str) {
    if (str[0] === "(") {
      let count = 1,
        i = 1;
      while (i < str.length && count > 0) {
        if (str[i] === "(") count++;
        if (str[i] === ")") count--;
        i++;
      }
      return str.slice(0, i);
    }
    return str.match(/^[\d\.Math\.PIe\-]+/)?.[0] || "";
  }

  // --- internal application views/state UI changes ---
  updateDisplay() {
    this.exprDisplay.innerText = this.expression || "0";
    this.exprDisplay.scrollLeft = this.exprDisplay.scrollWidth;
  }

  adjustFontSize() {
    const len = this.resDisplay.innerText.length;
    if (len > 16) this.resDisplay.style.fontSize = "1.4rem";
    else if (len > 10) this.resDisplay.style.fontSize = "1.8rem";
    else this.resDisplay.style.fontSize = "2.5rem";
  }

  updateCounterUI() {
    this.calcCounterDisplay.innerText = `#${this.calcCounter}`;
  }

  // --- memory handlers ---
  handleMemory(action) {
    const currentVal = parseFloat(this.resDisplay.innerText) || 0;
    switch (action) {
      case "mc":
        this.memory = 0;
        this.showToast("Memory Cleared");
        break;
      case "mr":
        this.expression += this.memory.toString();
        this.updateDisplay();
        break;
      case "m+":
        this.memory += currentVal;
        this.showToast("Added to Memory");
        break;
      case "m-":
        this.memory -= currentVal;
        this.showToast("Subtracted from Memory");
        break;
      case "ms":
        this.memory = currentVal;
        this.showToast("Stored to Memory");
        break;
    }
    localStorage.setItem("calc_memory", this.memory);
  }

  // --- history sub-system ---
  saveHistoryItem(expression, result) {
    this.history.unshift({ expr: expression, res: result });
    if (this.history.length > 30) this.history.pop(); // Max cap history list
    localStorage.setItem("calc_history", JSON.stringify(this.history));
    this.renderHistory();
  }

  renderHistory() {
    this.historyList.innerHTML = "";
    if (this.history.length === 0) {
      this.historyList.innerHTML =
        '<div style="color:var(--text-secondary); text-align:center; padding: 20px;">No calculation history.</div>';
      return;
    }
    this.history.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `<div class="history-expr">${item.expr}</div><div class="history-res">${item.res}</div>`;
      div.addEventListener("click", () => {
        this.expression = item.expr;
        this.resDisplay.innerText = item.res;
        this.shouldReset = false;
        this.updateDisplay();
        this.historyPanel.classList.remove("open");
        this.historyPanel.setAttribute("aria-hidden", "true");
      });
      this.historyList.appendChild(div);
    });
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem("calc_history");
    this.renderHistory();
    this.showToast("History Cleared");
  }

  showToast(msg) {
    const toast = document.getElementById("toast");
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2000);
  }
}

// --- DOM Orchestration Layer ---
document.addEventListener("DOMContentLoaded", () => {
  const calc = new ScientificCalculator();

  // Event Delegation Grid Pattern Handler
  document.querySelector(".keypad").addEventListener("click", (e) => {
    const btn = e.target.closest(".btn");
    if (!btn) return;
    calc.playClick();

    const action = btn.dataset.action;
    const value = btn.dataset.value;

    if (btn.hasAttribute("data-num")) return calc.appendToken(value);

    switch (action) {
      case "operator":
      case "sci-func":
      case "parenthesis":
      case "constant":
        calc.appendToken(value);
        break;
      case "clear":
        calc.clear();
        break;
      case "delete":
        calc.delete();
        break;
      case "negate":
        calc.toggleNegate();
        break;
      case "percentage":
        calc.appendPercentage();
        break;
      case "decimal":
        calc.appendToken(".");
        break;
      case "deg-rad":
        calc.toggleAngleMode();
        break;
      case "equals":
        calc.evaluate();
        break;
    }
  });

  // Memory Delegation Wire
  document.querySelector(".memory-row").addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-mem")) {
      calc.playClick();
      calc.handleMemory(e.target.dataset.action);
    }
  });

  // App Control Panel Listeners
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const doc = document.documentElement;
    const targetTheme =
      doc.getAttribute("data-theme") === "dark" ? "light" : "dark";
    doc.setAttribute("data-theme", targetTheme);
    localStorage.setItem("calc_theme", targetTheme);
  });

  // Restore cached theme state preference safely
  const storedTheme = localStorage.getItem("calc_theme") || "dark";
  document.documentElement.setAttribute("data-theme", storedTheme);

  const soundToggle = document.getElementById("sound-toggle");
  soundToggle.addEventListener("click", () => {
    calc.soundEnabled = !calc.soundEnabled;
    soundToggle.innerText = calc.soundEnabled ? "🔊" : "🔇";
  });

  document
    .getElementById("precision-select")
    .addEventListener("change", (e) => {
      calc.precision = e.target.value;
      if (calc.resDisplay.innerText !== "0") calc.evaluate();
    });

  const historyPanel = document.getElementById("history-panel");
  document.getElementById("toggle-history").addEventListener("click", () => {
    const isOpen = historyPanel.classList.toggle("open");
    historyPanel.setAttribute("aria-hidden", !isOpen);
  });

  document
    .getElementById("clear-history")
    .addEventListener("click", () => calc.clearHistory());

  document.getElementById("copy-result").addEventListener("click", () => {
    navigator.clipboard
      .writeText(calc.resDisplay.innerText)
      .then(() => calc.showToast("Copied to clipboard!"))
      .catch(() => calc.showToast("Copy failed"));
  });

  // Native Physical Keyboard Map Bindings Layout System
  document.addEventListener("keydown", (e) => {
    if (["GroupNext", "GroupPrevious"].includes(e.key)) return; // Pass structural meta tabs
    let key = e.key;
    calc.playClick();

    if (/[0-9]/.test(key)) calc.appendToken(key);
    else if (key === ".") calc.appendToken(".");
    else if (key === "+") calc.appendToken("+");
    else if (key === "-") calc.appendToken("-");
    else if (key === "*") calc.appendToken("×");
    else if (key === "/") {
      e.preventDefault();
      calc.appendToken("÷");
    } else if (key === "%") calc.appendPercentage();
    else if (key === "(" || key === ")") calc.appendToken(key);
    else if (key === "Enter" || key === "=") {
      e.preventDefault();
      calc.evaluate();
    } else if (key === "Backspace") calc.delete();
    else if (key === "Escape") calc.clear();
  });
});

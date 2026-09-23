// Small Laddu Lucky Draw — standalone script
// Supports booking MULTIPLE FULL TICKETS in a single submission: each
// ticket has its OWN Name/Tower/Flat/Mobile/Serial (since different
// tokens can belong to different people), but they all share ONE
// payment screenshot upload and are submitted together in one go.

let takenSerials = new Set();
let lastBookedList = []; // [{name, mobile, tower, flat, serialNumber}, ...] after a successful submit
let paymentProofDataUrl = null;
let ticketCount = 0; // total number of ticket blocks currently rendered

function el(id) { return document.getElementById(id); }

// ---------- UPI setup ----------
function buildUpiUri(amount) {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: UPI_PAYEE_NAME,
    am: String(amount),
    cu: "INR",
    tn: "Ganesh Utsav Lucky Draw Token",
  });
  return "upi://pay?" + params.toString();
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function setupPaymentSection() {
  el("upiIdText").textContent = UPI_ID;
  el("upiPayeeText").textContent = UPI_PAYEE_NAME;

  // Use an explicit click handler (window.location.href) rather than
  // relying solely on the anchor's href — this is the more reliable way
  // to trigger the Android/iOS "open with" UPI app chooser from inside
  // mobile browsers (some in-app browsers ignore plain <a href> taps for
  // custom URI schemes).
  el("upiPayBtn").addEventListener("click", (e) => {
    e.preventDefault();
    const count = document.querySelectorAll(".ticket-block").length || 1;
    const totalAmount = count * Number(UPI_AMOUNT);
    window.location.href = buildUpiUri(totalAmount);
  });

  refreshOrderSummary();
}

function refreshOrderSummary() {
  const count = document.querySelectorAll(".ticket-block").length;
  const totalAmount = count * Number(UPI_AMOUNT);

  el("payAmountText").textContent = "₹" + totalAmount + "/-";
  el("ticketCountText").textContent = count + (count === 1 ? " ticket" : " tickets");
  el("orderTotalText").textContent = "Total: ₹" + totalAmount + "/-";

  const upiUri = buildUpiUri(totalAmount);
  const upiBtn = el("upiPayBtn");
  const upiWebNote = el("upiWebNote");
  upiBtn.href = upiUri; // kept in sync too, as a fallback for long-press/share
  if (isMobileDevice()) {
    upiBtn.style.display = "block";
    upiWebNote.style.display = "none";
  } else {
    upiBtn.style.display = "none";
    upiWebNote.style.display = "block";
  }
}

// Payment screenshot upload -> preview + base64 for submission
el("paymentProof").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    paymentProofDataUrl = reader.result;
    el("paymentProofPreview").src = paymentProofDataUrl;
    el("paymentProofPreviewWrap").style.display = "block";
  };
  reader.readAsDataURL(file);
});

// ---------- Serial number dropdowns ----------
async function loadLuckyList() {
  try {
    const res = await fetch(API_URL + "?action=luckyList");
    const data = await res.json();
    if (data.ok) {
      takenSerials = new Set((data.takenSerials || []).map(Number));
    }
  } catch (err) {
    console.error("Failed to load lucky draw list", err);
  }
  renderAllSerialDropdowns();
}

function getAllSerialSelects() {
  return Array.from(document.querySelectorAll(".serial-select"));
}

function buildSerialOptionsHtml(excludeSet) {
  let html = '<option value="" disabled selected>Select</option>';
  for (let n = LUCKY_SERIAL_START; n <= LUCKY_SERIAL_END; n++) {
    if (takenSerials.has(n)) continue;
    if (excludeSet.has(n)) continue;
    html += '<option value="' + n + '">#' + String(n).padStart(4, "0") + "</option>";
  }
  return html;
}

// Rebuilds every serial dropdown's option list so the same number can't be
// picked twice across tickets, and taken numbers vanish everywhere.
function renderAllSerialDropdowns() {
  const selects = getAllSerialSelects();
  const chosenValues = selects.map((s) => s.value).filter(Boolean).map(Number);

  selects.forEach((sel) => {
    const own = Number(sel.value);
    const excludeSet = new Set(chosenValues.filter((v) => v !== own));
    const prev = sel.value;
    sel.innerHTML = buildSerialOptionsHtml(excludeSet);
    if (prev && !excludeSet.has(Number(prev)) && !takenSerials.has(Number(prev))) {
      sel.value = prev;
    }
  });

  refreshOrderSummary();
}

document.addEventListener("change", (e) => {
  if (e.target.classList && e.target.classList.contains("serial-select")) {
    renderAllSerialDropdowns();
  }
});

// ---------- Ticket block template ----------
function ticketBlockHtml(idx, showRemove) {
  return (
    '<div class="card ticket-card ticket-block" data-ticket-idx="' + idx + '">' +
      '<div class="ticket-block-header">' +
        '<h2>🎫 Ticket ' + (idx + 1) + '</h2>' +
        (showRemove ? '<button type="button" class="remove-ticket-btn" title="Remove this ticket">✕ Remove</button>' : '') +
      '</div>' +
      '<div class="ticket">' +
        '<div class="ticket-left">' +
          '<img src="assets/ganesha.jpg" alt="Lord Ganesha" class="ganesha-img" />' +
        '</div>' +
        '<div class="ticket-right">' +
          '<div class="ticket-serial-box">' +
            '<span class="serial-caption">Token Serial No.</span>' +
            '<select class="serial-select" required><option value="" disabled selected>Select</option></select>' +
          '</div>' +
          '<div class="row-brand"><span class="flower-icon">🌺</span><span class="brand-title">On Cloud 33</span><span class="flower-icon">🌺</span></div>' +
          '<div class="row-event">Ganesh Utsav 2026</div>' +
          '<div class="row-ribbon"><span class="gold-icon">✦</span><span class="ribbon-text">Small Laddu Lucky Draw</span><span class="gold-icon">✦</span></div>' +
          '<div class="row-price-wrap"><div class="row-price">Ticket / Token Price: <strong>₹100/-</strong></div></div>' +
          '<div class="ticket-fields">' +
            '<div class="field">' +
              '<label>Name <span class="required-star">*</span></label>' +
              '<input type="text" class="t-name" placeholder="Enter your full name" required />' +
            '</div>' +
            '<div class="field-row">' +
              '<div class="field">' +
                '<label>Tower <span class="required-star">*</span></label>' +
                '<select class="t-tower" required>' +
                  '<option value="" disabled selected>Select</option>' +
                  '<option value="T1">T1</option><option value="T2">T2</option>' +
                  '<option value="T3">T3</option><option value="T4">T4</option><option value="T5">T5</option>' +
                '</select>' +
              '</div>' +
              '<div class="field">' +
                '<label>Flat No. <span class="required-star">*</span></label>' +
                '<input type="text" class="t-flat" placeholder="e.g. 1203" required />' +
              '</div>' +
            '</div>' +
            '<div class="field">' +
              '<label>Mobile No. <span class="required-star">*</span></label>' +
              '<input type="tel" class="t-mobile" placeholder="10-digit mobile number" maxlength="10" required />' +
            '</div>' +
          '</div>' +
          '<div class="row-footer"><div class="footer-line-blue">Best Wishes to All Participants!</div><div class="footer-line-red">Ganpati Bappa Morya! 🐘</div></div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function renumberTicketBlocks() {
  const blocks = document.querySelectorAll(".ticket-block");
  blocks.forEach((block, i) => {
    block.querySelector("h2").textContent = "🎫 Ticket " + (i + 1);
    const removeBtn = block.querySelector(".remove-ticket-btn");
    if (removeBtn) removeBtn.style.display = blocks.length > 1 ? "inline-block" : "none";
  });
}

function addTicketBlock() {
  const container = el("ticketsContainer");
  const idx = ticketCount++;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = ticketBlockHtml(idx, true);
  const blockEl = wrapper.firstElementChild;
  container.appendChild(blockEl);

  const removeBtn = blockEl.querySelector(".remove-ticket-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      blockEl.remove();
      renumberTicketBlocks();
      renderAllSerialDropdowns();
    });
  }

  renumberTicketBlocks();
  renderAllSerialDropdowns();
}

el("addTicketBtn").addEventListener("click", addTicketBlock);

// ---------- Form submission ----------
el("luckyForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const statusMsg = el("luckyStatusMsg");
  statusMsg.className = "status-msg";

  const blocks = Array.from(document.querySelectorAll(".ticket-block"));
  const tickets = blocks.map((block) => ({
    name: block.querySelector(".t-name").value.trim(),
    tower: block.querySelector(".t-tower").value,
    flat: block.querySelector(".t-flat").value.trim(),
    mobile: block.querySelector(".t-mobile").value.trim(),
    serialNumber: Number(block.querySelector(".serial-select").value),
  }));

  for (const t of tickets) {
    if (!t.serialNumber) {
      statusMsg.className = "status-msg error";
      statusMsg.textContent = "Please select a Token Serial Number on every ticket.";
      return;
    }
    if (!t.name || !t.tower || !t.flat || !t.mobile) {
      statusMsg.className = "status-msg error";
      statusMsg.textContent = "Please fill in all required fields on every ticket.";
      return;
    }
    if (!/^[0-9]{10}$/.test(t.mobile)) {
      statusMsg.className = "status-msg error";
      statusMsg.textContent = "Please enter a valid 10-digit mobile number on every ticket.";
      return;
    }
  }
  if (!paymentProofDataUrl) {
    statusMsg.className = "status-msg error";
    statusMsg.textContent = "Please upload your payment screenshot before submitting.";
    return;
  }

  const btn = el("luckySubmitBtn");
  btn.disabled = true;
  btn.textContent = "Booking...";

  try {
    // Generate the actual downloadable ticket image for EACH ticket now,
    // so a permanent copy (not just a client-side-only render) is stored
    // alongside the submission for the admin/committee to view later.
    btn.textContent = "Preparing ticket image(s)...";
    const ticketImages = [];
    for (const t of tickets) {
      const dataUrl = await new Promise((resolve) => drawTicketToCanvas(t, resolve));
      ticketImages.push(dataUrl);
    }

    btn.textContent = "Booking...";
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        tickets, // array of {name, mobile, tower, flat, serialNumber} — backend books all atomically
        ticketImages, // one base64 PNG per ticket, same order as `tickets`
        paymentProof: paymentProofDataUrl,
      }),
    });
    const data = await res.json();

    if (data.ok) {
      statusMsg.className = "status-msg success";
      statusMsg.textContent = "🎉 " + tickets.length + " token(s) booked successfully! Your receipt(s) are ready below.";
      lastBookedList = tickets;
      renderReceiptList(lastBookedList);
      tickets.forEach((t) => takenSerials.add(t.serialNumber));

      // Reset back to a single blank ticket
      el("ticketsContainer").innerHTML = "";
      ticketCount = 0;
      addTicketBlock();

      el("paymentProofPreviewWrap").style.display = "none";
      paymentProofDataUrl = null;
      el("paymentProof").value = "";
      renderAllSerialDropdowns();
      showCelebration();
    } else {
      statusMsg.className = "status-msg error";
      statusMsg.textContent = data.error || "Something went wrong. Please try again.";
      await loadLuckyList();
    }
  } catch (err) {
    statusMsg.className = "status-msg error";
    statusMsg.textContent = "Network error. Please check your connection and try again.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Book My Lucky Draw Token(s)";
  }
});

// ---------- Receipt rendering (mirrors the ticket layout, one per token) ----------
function renderReceiptList(list) {
  const card = el("receiptCard");
  card.style.display = "block";

  const container = el("ticketPreviewList");
  container.innerHTML = list.map((details) => ticketHtml(details)).join('<div style="height:16px;"></div>');

  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ticketHtml(details) {
  return (
    '<div class="ticket">' +
      '<div class="ticket-left">' +
        '<img src="assets/ganesha.jpg" alt="Lord Ganesha" class="ganesha-img" />' +
        '<span class="stamp-badge">✔ SUBMITTED</span>' +
      '</div>' +
      '<div class="ticket-right">' +
        '<div class="ticket-serial-box"><span class="serial-caption">Token Serial No.</span><strong>' + String(details.serialNumber).padStart(4, "0") + "</strong></div>" +
        '<div class="row-brand"><span class="flower-icon">🌺</span><span class="brand-title">On Cloud 33</span><span class="flower-icon">🌺</span></div>' +
        '<div class="row-event">Ganesh Utsav 2026</div>' +
        '<div class="row-ribbon"><span class="gold-icon">✦</span><span class="ribbon-text">Small Laddu Lucky Draw</span><span class="gold-icon">✦</span></div>' +
        '<div class="row-price-wrap"><div class="row-price">Ticket / Token Price: <strong>₹100/-</strong></div></div>' +
        '<div class="ticket-fields">' +
          '<div class="field-line"><strong>Name:</strong> ' + escapeHtml(details.name) + "</div>" +
          '<div class="field-line"><strong>Tower:</strong> ' + escapeHtml(details.tower) + '&nbsp;&nbsp;<strong>Flat No.:</strong> ' + escapeHtml(details.flat) + "</div>" +
          '<div class="field-line"><strong>Mobile No.:</strong> ' + escapeHtml(details.mobile) + "</div>" +
        "</div>" +
        '<div class="row-footer"><div class="footer-line-blue">Best Wishes to All Participants!</div><div class="footer-line-red">Ganpati Bappa Morya! 🐘</div></div>' +
      "</div>" +
    "</div>"
  );
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// ---------- Download all receipts as separate PNGs ----------
el("downloadReceiptBtn").addEventListener("click", async () => {
  if (!lastBookedList.length) return;
  for (const details of lastBookedList) {
    await new Promise((resolve) => {
      drawTicketToCanvas(details, (dataUrl) => {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "GaneshUtsav2026_LuckyDraw_Token" + details.serialNumber + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        resolve();
      });
    });
  }
});

function drawTicketToCanvas(details, callback) {
  const canvas = el("ticketCanvas");
  // Print-ready size: 3in x 2in at 300 DPI
  const DPI = 300;
  canvas.width = 3 * DPI;    // 900px
  canvas.height = 2 * DPI;   // 600px
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;

  ctx.fillStyle = "#fffdf7";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#d4a017";
  ctx.lineWidth = 5;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  const leftW = W * 0.34;
  const rightCenterX = leftW + (W - leftW) / 2;

  function drawStamp() {
    // Rotated "SUBMITTED" rubber-stamp at the bottom of the Ganesha image
    ctx.save();
    ctx.translate(leftW / 2, H - 44);
    ctx.rotate((-12 * Math.PI) / 180);
    ctx.strokeStyle = "#b5121b";
    ctx.lineWidth = 3;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const stampW = 130, stampH = 32;
    roundRectLocal(ctx, -stampW / 2, -stampH / 2, stampW, stampH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#b5121b";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("✔ SUBMITTED", 0, 1);
    ctx.restore();
    ctx.textBaseline = "alphabetic";
  }

  function drawTextContent() {
    ctx.textAlign = "center";
    ctx.fillStyle = "#1450a3";
    ctx.font = "italic bold 18px Georgia";
    ctx.fillText("🌺  On Cloud 33  🌺", rightCenterX, 38);

    ctx.fillStyle = "#b5121b";
    ctx.font = "bold 23px Arial";
    ctx.fillText("Ganesh Utsav 2026", rightCenterX, 66);

    const ribbonX = leftW + 16, ribbonW = W - leftW - 32;
    ctx.fillStyle = "#b5121b";
    roundRectLocal(ctx, ribbonX, 76, ribbonW, 26, 13);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Arial";
    ctx.fillText("✦  Small Laddu Lucky Draw  ✦", ribbonX + ribbonW / 2, 93);

    ctx.fillStyle = "#e8b93a";
    const priceW = 158;
    roundRectLocal(ctx, rightCenterX - priceW / 2, 108, priceW, 22, 11);
    ctx.fill();
    ctx.fillStyle = "#2b1300";
    ctx.font = "bold 11px Arial";
    ctx.fillText("Ticket / Token Price: ₹100/-", rightCenterX, 123);

    ctx.textAlign = "left";
    ctx.fillStyle = "#2b1300";
    ctx.font = "bold 13px Arial";
    ctx.fillText("Name: " + details.name, leftW + 16, 155);
    ctx.fillText("Tower: " + details.tower + "    Flat No.: " + details.flat, leftW + 16, 176);
    ctx.fillText("Mobile No.: " + details.mobile, leftW + 16, 197);

    ctx.textAlign = "center";
    ctx.font = "italic bold 12px Arial";
    ctx.fillStyle = "#1450a3";
    ctx.fillText("Best Wishes to All Participants!", rightCenterX, H - 40);
    ctx.fillStyle = "#b5121b";
    ctx.fillText("Ganpati Bappa Morya!", rightCenterX, H - 22);

    ctx.textAlign = "left";
    ctx.strokeStyle = "#b9b3a6";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(W - 148, 16, 130, 46);
    ctx.strokeRect(W - 148, 16, 130, 46);
    ctx.fillStyle = "#1450a3";
    ctx.font = "9px Arial";
    ctx.fillText("Token Serial No.:", W - 140, 30);
    ctx.font = "bold 18px Arial";
    ctx.fillText(String(details.serialNumber).padStart(4, "0"), W - 140, 52);

    drawStamp();

    // toDataURL() can throw (e.g. SecurityError on a tainted canvas in some
    // browsers) — never let that bubble up unhandled and hang the caller.
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      console.error("toDataURL failed, returning blank fallback", err);
      dataUrl = "";
    }
    callback(dataUrl);
  }

  // Guard against the image request never firing onload/onerror (slow
  // network, flaky CDN, browser quirk) — without this, drawTicketToCanvas
  // could hang forever, freezing the whole submit flow (which is exactly
  // what caused "Preparing ticket image(s)..." to get stuck with no
  // request ever reaching the backend).
  let settled = false;
  const settleOnce = (fn) => {
    if (settled) return;
    settled = true;
    fn();
  };

  const timeoutId = setTimeout(() => {
    settleOnce(drawTextContent);
  }, 4000);

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = function () {
    clearTimeout(timeoutId);
    settleOnce(() => {
      try {
        const margin = 10;
        const dw = leftW - margin * 1.5;
        const dh = H - margin * 2;
        const scale = Math.min(dw / img.width, dh / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = margin + (dw - drawW) / 2;
        const dy = margin + (dh - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);
      } catch (err) {
        console.error("Failed to draw Ganesha image onto canvas", err);
      }
      drawTextContent();
    });
  };
  img.onerror = function () {
    clearTimeout(timeoutId);
    settleOnce(drawTextContent);
  };
  img.src = "assets/ganesha.jpg";
}

function roundRectLocal(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Celebration overlay + confetti ----------
let confettiAnimationId = null;

function showCelebration() {
  el("celebrationOverlay").classList.add("show");
  startConfetti();
}
function hideCelebration() {
  el("celebrationOverlay").classList.remove("show");
  stopConfetti();
}
el("celebrationCloseBtn").addEventListener("click", hideCelebration);
el("celebrationOverlay").addEventListener("click", (e) => {
  if (e.target.id === "celebrationOverlay") hideCelebration();
});

function startConfetti() {
  const canvas = el("confettiCanvas");
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ["#b5121b", "#d4a017", "#1450a3", "#ff7a00", "#2e7d32", "#ffffff"];
  const particles = [];
  for (let i = 0; i < 140; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      size: Math.random() * 7 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      speedY: Math.random() * 3 + 2,
      speedX: Math.random() * 2 - 1,
      rotation: Math.random() * 360,
      rotationSpeed: Math.random() * 8 - 4,
      shape: Math.random() > 0.5 ? "rect" : "circle",
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      p.y += p.speedY;
      p.x += p.speedX;
      p.rotation += p.rotationSpeed;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
    });
    confettiAnimationId = requestAnimationFrame(draw);
  }
  draw();
}

function stopConfetti() {
  if (confettiAnimationId) {
    cancelAnimationFrame(confettiAnimationId);
    confettiAnimationId = null;
  }
  const canvas = el("confettiCanvas");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

// ---------- Init ----------
addTicketBlock(); // start with one blank ticket, no remove button
setupPaymentSection();
loadLuckyList();

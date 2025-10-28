document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('video');
    const canvas = document.getElementById('output');
    const ctx = canvas.getContext('2d');
    const toggleBtn = document.getElementById('toggleBtn');
    const resetBtn = document.getElementById('resetBtn');
    const blinkDisplay = document.getElementById('blinkDisplay');
    const timerDisplay = document.getElementById('timerDisplay');
    const dataLogList = document.getElementById('dataLogList');
  
    // Bubble map
    const bubbleCanvas = document.getElementById('bubbleMap');
    const bubbleCtx = bubbleCanvas.getContext('2d');
    bubbleCanvas.width = 400;
    bubbleCanvas.height = 500;
    let bubbles = [];
  
    let stream = null;
    let cameraOn = false;
    let rafId = null;
  
    // Blink data
    let blinkCount = 0;
    let isBlinking = false;
    const blinkThreshold = 0.23;
    let cycleCount = 0;
  
    // Timer
    let timerInterval = null;
    let timeLeft = 60;
  
    // ---- FaceMesh Setup ----
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
  
    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  
    faceMesh.onResults(onResults);
  
    // ---- Bubble Map Functions ----
    function addBubble(blinkCount, cycle) {
      // Non-linear scaling for greater difference between small & large counts
      const baseRadius = Math.pow(blinkCount, 0.8) * 2 + 15;
      const radius = Math.min(120, baseRadius);
      const x = Math.random() * (bubbleCanvas.width - radius * 2) + radius;
      const y = Math.random() * (bubbleCanvas.height - radius * 2) + radius;
      const color = `hsl(${120 - Math.min(blinkCount * 4, 120)}, 85%, 55%)`;
  
      bubbles.push({ x, y, radius, color, label: `C${cycle}: ${blinkCount}` });
      drawBubbles();
    }
  
    function drawBubbles() {
      bubbleCtx.save(); // Save initial state
      bubbleCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset any transforms
      bubbleCtx.clearRect(0, 0, bubbleCanvas.width, bubbleCanvas.height); // Clear
      bubbleCtx.restore();
  
      // Draw each bubble normally (not mirrored)
      bubbles.forEach((b) => {
        bubbleCtx.beginPath();
        bubbleCtx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        bubbleCtx.fillStyle = b.color;
        bubbleCtx.globalAlpha = 0.75;
        bubbleCtx.fill();
        bubbleCtx.globalAlpha = 1;
  
        // Properly oriented label text
        bubbleCtx.save();
        bubbleCtx.fillStyle = '#fff';
        bubbleCtx.font = '14px monospace';
        bubbleCtx.textAlign = 'center';
        bubbleCtx.textBaseline = 'middle';
        bubbleCtx.setTransform(1, 0, 0, 1, 0, 0); // Ensure normal (non-mirrored) orientation
        bubbleCtx.fillText(b.label, b.x, b.y);
        bubbleCtx.restore();
      });
    }
  
    // ---- Timer Functions ----
    function startTimer() {
      clearInterval(timerInterval);
      timeLeft = 60;
      timerDisplay.innerText = `Time: ${timeLeft}s`;
  
      timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.innerText = `Time: ${timeLeft}s`;
  
        if (timeLeft <= 0) {
          clearInterval(timerInterval);
  
          // save final blink data and add bubble
          cycleCount++;
          const listItem = document.createElement('li');
          listItem.textContent = `Cycle ${cycleCount}: ${blinkCount} blinks`;
          dataLogList.prepend(listItem);
          addBubble(blinkCount, cycleCount);
  
          // Reset and restart
          blinkCount = 0;
          blinkDisplay.innerText = `Blinks: ${blinkCount}`;
          startTimer(); // restart automatically
        }
      }, 1000);
    }
  
    function stopTimer() {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  
    // ---- Camera Controls ----
    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
  
        await new Promise((resolve) => {
          if (video.readyState >= 2) resolve();
          else video.onloadedmetadata = () => resolve();
        });
  
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
  
        cameraOn = true;
        toggleBtn.textContent = 'Turn Camera Off';
        startTimer();
  
        const sendFrame = async () => {
          if (!cameraOn) return;
          await faceMesh.send({ image: video });
          rafId = requestAnimationFrame(sendFrame);
        };
        sendFrame();
      } catch (err) {
        console.error('Camera error:', err);
        alert('Could not start camera. Check permissions or run over HTTPS.');
      }
    }
  
    function stopCamera() {
      cameraOn = false;
      stopTimer();
  
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      toggleBtn.textContent = 'Turn Camera On';
    }
  
    toggleBtn.addEventListener('click', () => {
      if (!cameraOn) startCamera();
      else stopCamera();
    });
  
    // ---- Blink Detection ----
    function getEAR(upper, lower, leftCorner, rightCorner) {
      const vertical = Math.hypot(upper.x - lower.x, upper.y - lower.y);
      const horizontal = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
      return vertical / horizontal;
    }
  
    function detectBlink(landmarks) {
      const rightUpper = landmarks[159];
      const rightLower = landmarks[145];
      const rightLeftCorner = landmarks[33];
      const rightRightCorner = landmarks[133];
  
      const leftUpper = landmarks[386];
      const leftLower = landmarks[374];
      const leftLeftCorner = landmarks[263];
      const leftRightCorner = landmarks[362];
  
      const rightEAR = getEAR(rightUpper, rightLower, rightLeftCorner, rightRightCorner);
      const leftEAR = getEAR(leftUpper, leftLower, leftLeftCorner, leftRightCorner);
      const avgEAR = (rightEAR + leftEAR) / 2;
  
      if (avgEAR < blinkThreshold && !isBlinking) {
        isBlinking = true;
        blinkCount++;
        blinkDisplay.innerText = `Blinks: ${blinkCount}`;
      } else if (avgEAR > blinkThreshold) {
        isBlinking = false;
      }
    }
  
    // ---- Results from FaceMesh ----
    function onResults(results) {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  
      if (results.multiFaceLandmarks) {
        for (const landmarks of results.multiFaceLandmarks) {
          drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#00FFAA', lineWidth: 1 });
          drawConnectors(ctx, landmarks, FACEMESH_RIGHT_EYE, { color: '#FF3030' });
          drawConnectors(ctx, landmarks, FACEMESH_LEFT_EYE, { color: '#30FF30' });
          drawConnectors(ctx, landmarks, FACEMESH_LIPS, { color: '#FFD700' });
  
          detectBlink(landmarks);
        }
      }
      ctx.restore();
    }
  
    // ---- Reset Button ----
    resetBtn.addEventListener('click', () => {
      blinkCount = 0;
      blinkDisplay.innerText = `Blinks: ${blinkCount}`;
      timeLeft = 60;
      timerDisplay.innerText = `Time: ${timeLeft}s`;
      dataLogList.innerHTML = '';
      bubbles = [];
      drawBubbles();
      cycleCount = 0;
    });
  
    toggleBtn.style.zIndex = 9999;
  });
  
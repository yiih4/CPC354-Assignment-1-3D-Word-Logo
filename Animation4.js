"use strict";

// --- GLOBAL VARIABLES ---
var gl;
var program;
var mvpMatrixLoc;

// Objects to hold buffer data for shapes (L and O)
var shapeL, shapeO;

// Lighting
var useLightingLoc;
var isLightEnabled = false;

// Configuration
let EXTRUSION_DEPTH = 0.5; // Default extrusion depth
let COLOR_L = vec4(0.8, 0, 0.2, 1.0); // Reddish
let COLOR_O = vec4(0.2, 0.2, 0.6, 1.0); // Blueish
const colorModes = {
  classic: { L: "#cc0033", O: "#333399" }, // Red & Blue
  neon: { L: "#00ffcc", O: "#ff00ff" }, // Neon cyan & magenta
  gold: { L: "#ffd700", O: "#daa520" }, // Gold tones
  forest: { L: "#228b22", O: "#32cd32" }, // Dark green & lime
  ocean: { L: "#1e90ff", O: "#00ced1" }, // Blue & teal
  candy: { L: "#ff69b4", O: "#ba55d3" }, // Pink & purple
};

let animSeq = 0; // Animation sequence
let thetaX = 0; // X-axis rotation
let thetaY = 0; // Y-axis rotation
let thetaZ = 0; // Z-axis rotation
let scaleFactor = 1.0; // Scaling factor for the word logo
const maxScale = 2.0; // Target scale for "full-screen" effect
let translateX = 0;
let translateY = 0; // Translation values
let isAnimating = false;
let yRotateEnabled = false;
let xRotateEnabled = false;
let iterations = 1;
let currentIteration = 0;
let animSpeed = 1;
let additionalAnimPhase = 0;
let translateEnabled = false;
let isRenderActive = false;

// UI elements
var startBtn,
  stopBtn,
  lightBtn,
  yRotateCheck,
  xRotateCheck,
  translateCheck,
  iterationSlider,
  iterationValue,
  speedSlider,
  speedValue,
  depthSlider,
  depthValue,
  colorLInput,
  colorOInput,
  colorModeSelect,
  bgColorInput;

// --- DEFINE GEOMETRY ---

// Define 2D profile for 'L' (Counter-Clockwise)
const vertices2D_L = [
  vec2(-0.5, -1.0), // 0: Bottom Left
  vec2(0.5, -1.0), // 1: Bottom Right
  vec2(0.5, -0.7), // 2: Inner Corner Right
  vec2(-0.2, -0.7), // 3: Inner Corner Left
  vec2(-0.2, 1.0), // 4: Top Right
  vec2(-0.5, 1.0), // 5: Top Left
];

// Define 2D profile for 'O' (Counter-Clockwise)
// Indices 0-3: Outer Box, 4-7: Inner Box (Hole)
const vertices2D_O = [
  // Outer Box
  vec2(-0.5, -1.0), // 0: Bottom Left
  vec2(0.5, -1.0), // 1: Bottom Right
  vec2(0.5, 1.0), // 2: Top Right
  vec2(-0.5, 1.0), // 3: Top Left
  // Inner Box
  vec2(-0.2, -0.7), // 4: Inner Bottom Left
  vec2(0.2, -0.7), // 5: Inner Bottom Right
  vec2(0.2, 0.7), // 6: Inner Top Right
  vec2(-0.2, 0.7), // 7: Inner Top Left
];

// --- INITIALIZATION ---

window.onload = function init() {
  var canvas = document.getElementById("gl-canvas");
  gl = canvas.getContext("webgl2");
  if (!gl) {
    alert("WebGL 2.0 unavailable");
    return;
  }

  // Configure WebGL
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.9, 0.9, 0.9, 1.0);
  gl.enable(gl.DEPTH_TEST);

  // Load shaders
  program = initShaders(gl, "vertex-shader", "fragment-shader");
  gl.useProgram(program);

  mvpMatrixLoc = gl.getUniformLocation(program, "uMVP");

  // Build Shapes
  shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
  shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");

  // Window resize
  resizeCanvas();

  // Setup UI event listeners
  updateUI();

  // Set Up lighting
  useLightingLoc = gl.getUniformLocation(program, "uLightEnabled");
  gl.uniform1i(useLightingLoc, 0);

  // Start the render loop
  if (!isRenderActive) {
    isRenderActive = true;
    render();
  }
};

// --- GEOMETRY BUILDER ---
function createExtrudedShape(vertices2D, depth, color, type) {
  var positions = [];
  var colors = [];
  var indices = [];
  var halfDepth = depth / 2.0;
  var vlength = vertices2D.length;

  // Generate Vertices
  // Front Face (z = +halfDepth = +0.25)
  for (let i = 0; i < vlength; i++) {
    positions.push(vec3(vertices2D[i][0], vertices2D[i][1], halfDepth));
    colors.push(color);
  }
  // Back Face (z = -halfDepth = -0.25)
  for (let i = 0; i < vlength; i++) {
    positions.push(vec3(vertices2D[i][0], vertices2D[i][1], -halfDepth));
    // Make back face slightly darker
    colors.push(vec4(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, 1.0));
  }

  // Triangulation: Generate Indices
  if (type === "L") {
    // Front Face
    indices.push(0, 1, 3);
    indices.push(1, 2, 3);
    indices.push(0, 3, 5);
    indices.push(3, 4, 5);

    // Back Face (Offset by vlength, reverse winding order)
    indices.push(vlength + 0, vlength + 3, vlength + 1);
    indices.push(vlength + 1, vlength + 3, vlength + 2);
    indices.push(vlength + 0, vlength + 5, vlength + 3);
    indices.push(vlength + 3, vlength + 5, vlength + 4);

    // Side Faces (Standard loop)
    generateSideIndices(indices, vlength);
  } else if (type === "O") {
    // Front Face (4 trapezoids connecting outer to inner)
    pushQuad(indices, 0, 1, 5, 4); // Bottom
    pushQuad(indices, 1, 2, 6, 5); // Right
    pushQuad(indices, 2, 3, 7, 6); // Top
    pushQuad(indices, 3, 0, 4, 7); // Left

    // Back Face (Offset by vlength, reverse winding)
    pushBackQuad(indices, 0, 1, 5, 4, vlength);
    pushBackQuad(indices, 1, 2, 6, 5, vlength);
    pushBackQuad(indices, 2, 3, 7, 6, vlength);
    pushBackQuad(indices, 3, 0, 4, 7, vlength);

    // Side Faces
    // External Loop (0->1->2->3->0)
    generateSideLoop(indices, 0, 4, vlength);
    // Internal Loop (4->5->6->7->4)
    generateSideLoop(indices, 4, 4, vlength);
  }

  // Create and bind WebGL buffers
  var pBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(positions), gl.STATIC_DRAW);

  var cBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);

  var iBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW
  );

  // Return the object containing buffer info
  return {
    pBuffer: pBuffer,
    cBuffer: cBuffer,
    iBuffer: iBuffer,
    count: indices.length,
  };
}

// --- HELPER FUNCTIONS for Triangulation ---

// Helper to generate side faces for letter 'L'
function generateSideIndices(indices, n) {
  for (let i = 0; i < n; i++) {
    let next = (i + 1) % n;
    // Front vertices: i, next
    // Back vertices: i+N, next+N
    // Two triangles to form the rectangular side face
    indices.push(i, next, i + n);
    indices.push(next, next + n, i + n);
  }
}

// Helper to generate side faces for letter 'O'
function generateSideLoop(indices, startIndex, loopCount, n) {
  for (let i = 0; i < loopCount; i++) {
    let curr = startIndex + i;
    let next = startIndex + ((i + 1) % loopCount);

    indices.push(curr, next, curr + n);
    indices.push(next, next + n, curr + n);
  }
}

// Helper to push a quad (2 triangles)
function pushQuad(indices, a, b, c, d) {
  indices.push(a, b, c);
  indices.push(a, c, d);
}

// Helper to push a back face quad (2 triangles) with reversed winding
function pushBackQuad(indices, a, b, c, d, vlength) {
  indices.push(vlength + a, vlength + d, vlength + c);
  indices.push(vlength + a, vlength + c, vlength + b);
}

// --- RENDERING ---

function render() {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniform1i(useLightingLoc, isLightEnabled ? 1 : 0);

  // Setup Camera
  const V = lookAt(vec3(1, 4, 9), vec3(0, 0, 0), vec3(0, 1, 0));
  const P = perspective(45, gl.canvas.width / gl.canvas.height, 0.1, 100);
  const VP = mult(P, V);

  if (isAnimating) {
    defaultAnim();
  }

  if (additionalAnimPhase === 1 && xRotateEnabled) {
    thetaX += 1 * animSpeed;
  } else if (additionalAnimPhase === 2 && yRotateEnabled) {
    thetaY += 1 * animSpeed;
  }

  // Apply transformations
  let M = mult(
    translate(translateX, translateY, 0),
    mult(
      rotateX(thetaX),
      mult(
        rotateY(thetaY),
        mult(rotateZ(thetaZ), scale(scaleFactor, scaleFactor, 1))
      )
    )
  );

  // Draw shapes with rotated matrix
  drawShape(shapeL, mult(VP, mult(M, translate(-1.5, 0, 0)))); // Left L
  drawShape(shapeO, mult(VP, mult(M, translate(0, 0, 0)))); // O
  drawShape(shapeL, mult(VP, mult(M, translate(1.5, 0, 0)))); // Right L

  // Continue animation loop
  if (isRenderActive) {
    requestAnimationFrame(render);
  }
}

function drawShape(shape, mvpMatrix) {
  // Bind position buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, shape.pBuffer);
  var positionLoc = gl.getAttribLocation(program, "aPosition");
  gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLoc);

  // Bind color buffer
  gl.bindBuffer(gl.ARRAY_BUFFER, shape.cBuffer);
  var colorLoc = gl.getAttribLocation(program, "aColor");
  gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(colorLoc);

  // Bind index buffer
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shape.iBuffer);

  // Send Matrix Uniform
  gl.uniformMatrix4fv(mvpMatrixLoc, false, flatten(mvpMatrix));

  // Draw Elements (Indexed Drawing)
  gl.drawElements(gl.TRIANGLES, shape.count, gl.UNSIGNED_SHORT, 0);
}

// Additional animations function
function additionalAnim() {
  switch (animSeq) {
    case 5: // Start additional animations after enlarge
      if (translateEnabled) {
        clockwiseTranslation();
      } else if (xRotateEnabled) {
        additionalAnimPhase = 1;
        animSeq = 7;
      } else if (yRotateEnabled) {
        additionalAnimPhase = 2;
        animSeq = 8;
      } else {
        currentIteration++;
        if (currentIteration < iterations) {
          if (iterations > 1) {
            animSeq = 9;
          } else {
            resetAnimationCycle();
          }
        } else {
          isAnimating = false;
          enableUI();
        }
      }
      break;

    case 6: // Translation complete, move to additional animations
      if (xRotateEnabled) {
        additionalAnimPhase = 1;
        animSeq = 7;
      } else if (yRotateEnabled) {
        additionalAnimPhase = 2;
        animSeq = 8;
      } else {
        currentIteration++;
        if (currentIteration < iterations) {
          if (iterations > 1) {
            animSeq = 9;
          } else {
            resetAnimationCycle();
          }
        } else {
          isAnimating = false;
          enableUI();
        }
      }
      break;

    case 7: // X-axis rotation phase
      if (thetaX >= 360) {
        thetaX = 0;
        if (yRotateEnabled) {
          additionalAnimPhase = 2;
          animSeq = 8;
        } else {
          currentIteration++;
          if (currentIteration < iterations) {
            if (iterations > 1) {
              animSeq = 9;
            } else {
              resetAnimationCycle();
            }
          } else {
            isAnimating = false;
            enableUI();
            additionalAnimPhase = 0;
          }
        }
      }
      break;

    case 8: // Y-axis rotation phase
      if (thetaY >= 360) {
        thetaY = 0;
        currentIteration++;
        if (currentIteration < iterations) {
          if (iterations > 1) {
            animSeq = 9;
          } else {
            resetAnimationCycle();
          }
        } else {
          isAnimating = false;
          enableUI();
          additionalAnimPhase = 0;
        }
      }
      break;
  }
}

// Clockwise translation function
let translationStep = 0;
function clockwiseTranslation() {
  switch (translationStep) {
    case 0: // Move to middle upper
      translateY += 0.02 * animSpeed;
      if (translateY >= 1.5) translationStep = 1;
      break;
    case 1: // Move to top right
      translateX += 0.02 * animSpeed;
      if (translateX >= 2.0) translationStep = 2;
      break;
    case 2: // Move to bottom right
      translateY -= 0.02 * animSpeed;
      if (translateY <= -2.0) translationStep = 3;
      break;
    case 3: // Move to bottom left
      translateX -= 0.02 * animSpeed;
      if (translateX <= -2.0) translationStep = 4;
      break;
    case 4: // Move to top left
      translateY += 0.02 * animSpeed;
      if (translateY >= 1.5) translationStep = 5;
      break;
    case 5: // Move back to middle upper
      translateX += 0.02 * animSpeed;
      if (translateX >= 0) translationStep = 6;
      break;
    case 6: // Move back to middle center
      translateY -= 0.02 * animSpeed;
      if (translateY <= 0) {
        translationStep = 0;
        animSeq = 6;
      }
      break;
  }
}

// Handles the animation sequence of the word logo
function defaultAnim() {
  switch (animSeq) {
    case 0: // Rotate to the right by 180 degrees
      thetaZ -= 1 * animSpeed;
      if (thetaZ <= -180) animSeq = 1;
      break;

    case 1: // Rotate back to original
      thetaZ += 1 * animSpeed;
      if (thetaZ >= 0) animSeq = 2;
      break;

    case 2: // Rotate to the left by 180 degrees
      thetaZ += 1 * animSpeed;
      if (thetaZ >= 180) animSeq = 3;
      break;

    case 3: // Rotate back to original
      thetaZ -= 1 * animSpeed;
      if (thetaZ <= 0) animSeq = 4;
      break;

    case 4: // Gradually enlarge the word logo to full-screen size
      if (scaleFactor < maxScale) {
        scaleFactor += 0.01 * animSpeed;
      } else {
        // Check if we need to repeat default animation
        if (
          currentIteration + 1 < iterations &&
          !translateEnabled &&
          !xRotateEnabled &&
          !yRotateEnabled
        ) {
          // Start delarge animation if iterations > 1
          if (iterations > 1) {
            animSeq = 9;
          } else {
            thetaZ = 0;
            scaleFactor = 1.0;
            animSeq = 0;
            currentIteration++;
          }
        } else {
          animSeq = 5;
        }
      }
      break;

    case 5: // Start additional animations after enlarge
    case 6: // Translation complete
    case 7: // X-axis rotation phase
    case 8: // Y-axis rotation phase
      additionalAnim();
      break;

    case 9: // Delarge to origin size after each iteration
      if (scaleFactor > 1.0) {
        scaleFactor -= 0.01 * animSpeed;
      } else {
        thetaX = 0;
        thetaY = 0;
        thetaZ = 0;
        translateX = 0;
        translateY = 0;
        scaleFactor = 1.0;
        translationStep = 0;
        additionalAnimPhase = 0;
        animSeq = 0;
      }
      break;
  }
}

function startAnimation() {
  // Reset values before starting
  theta = 0;
  thetaY = 0;
  thetaX = 0;
  translateX = 0;
  translateY = 0;
  scaleFactor = 1.0;
  animSeq = 0;
  currentIteration = 0;
  additionalAnimPhase = 0;
  translationStep = 0;
  isAnimating = true;
  disableUI();
}

function stopResetAnimation() {
  isAnimating = false;
  resetValue();
  enableUI();
}

function disableUI() {
  startBtn.disabled = true;
  yRotateCheck.disabled = true;
  xRotateCheck.disabled = true;
  translateCheck.disabled = true;
  iterationSlider.disabled = true;
  speedSlider.disabled = true;
  depthSlider.disabled = true;
  colorModeSelect.disabled = true;
  colorLInput.disabled = true;
  colorOInput.disabled = true;
  bgColorInput.disabled = true;
  lightBtn.disabled = true;
}

function enableUI() {
  startBtn.disabled = false;
  yRotateCheck.disabled = false;
  xRotateCheck.disabled = false;
  translateCheck.disabled = false;
  iterationSlider.disabled = false;
  speedSlider.disabled = false;
  depthSlider.disabled = false;
  colorModeSelect.disabled = false;
  colorLInput.disabled = false;
  colorOInput.disabled = false;
  bgColorInput.disabled = false;
  lightBtn.disabled = false;
}

function resetValue() {
  // Animation/Transform Reset
  theta = 0;
  thetaY = 0;
  thetaX = 0;
  translateX = 0;
  translateY = 0;
  scaleFactor = 1.0;
  animSeq = 0;
  currentIteration = 0;
  additionalAnimPhase = 0;
  translationStep = 0;

  // Checkbox Reset
  yRotateEnabled = false;
  xRotateEnabled = false;
  translateEnabled = false;
  yRotateCheck.checked = false;
  xRotateCheck.checked = false;
  translateCheck.checked = false;

  // Reset Iteration and Speed to 1
  iterations = 1;
  iterationSlider.value = 1;
  iterationValue.textContent = 1;

  animSpeed = 1;
  speedSlider.value = 1;
  speedValue.textContent = 1;

  // Reset extrusion depth
  EXTRUSION_DEPTH = 0.5;
  depthSlider.value = EXTRUSION_DEPTH;
  depthValue.textContent = EXTRUSION_DEPTH.toFixed(2);

  // Reset logo colors
  colorModeSelect.value = "classic"; // Set select box to 'classic'
  COLOR_L = hexToVec4(colorModes.classic.L); // default red
  COLOR_O = hexToVec4(colorModes.classic.O); // default blue
  colorLInput.value = colorModes.classic.L;
  colorOInput.value = colorModes.classic.O;

  // Reset canvas background color
  bgColorInput.value = "#E6E6E6";
  gl.clearColor(0.9, 0.9, 0.9, 1.0); // hex #E6E6E6 to RGBA

  // Recreate shapes with reset values
  shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
  shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");

  // Reset toggle light
  isLightEnabled = false;
  lightBtn.innerText = "Toggle Light: OFF";
}

// Helper function to convert #RRGGBB to vec4
function hexToVec4(hex) {
  // #cc0033, cc=204
  let r = parseInt(hex.slice(1, 3), 16) / 255; // 204 / 255 ≈ 0.8
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  return vec4(r, g, b, 1.0);
}

// Window resize handler
function resizeCanvas() {
  const canvas = document.getElementById("gl-canvas");
  canvas.width = window.innerWidth * 0.74; // set canvas width to 74% of current browser window width
  canvas.height = window.innerHeight * 0.93; // set canvas height to 93% of current browser window height
  // Update WebGL viewport to match the new canvas size
  // Parameters: x, y, width, height
  // (0,0) is bottom-left corner; width/height = full canvas
  gl.viewport(0, 0, canvas.width, canvas.height);
}

// --- UI EVENT LISTENERS ---
function updateUI() {
  // Get UI elements
  startBtn = document.getElementById("startBtn");
  stopBtn = document.getElementById("stopBtn");
  lightBtn = document.getElementById("lightBtn");
  yRotateCheck = document.getElementById("yRotateCheck");
  xRotateCheck = document.getElementById("xRotateCheck");
  translateCheck = document.getElementById("translateCheck");
  iterationSlider = document.getElementById("iterationSlider");
  iterationValue = document.getElementById("iterationValue");
  speedSlider = document.getElementById("speedSlider");
  speedValue = document.getElementById("speedValue");
  depthSlider = document.getElementById("depthSlider");
  depthValue = document.getElementById("depthValue");
  colorLInput = document.getElementById("colorL");
  colorOInput = document.getElementById("colorO");
  colorModeSelect = document.getElementById("colorModeSelect");
  bgColorInput = document.getElementById("bgColor");

  // Add event listeners
  startBtn.addEventListener("click", startAnimation);
  stopBtn.addEventListener("click", stopResetAnimation);
  lightBtn.addEventListener("click", toggleLight);
  yRotateCheck.addEventListener("change", function () {
    yRotateEnabled = this.checked;
    if (!yRotateEnabled) {
      thetaY = 0;
    }
  });
  xRotateCheck.addEventListener("change", function () {
    xRotateEnabled = this.checked;
    if (!xRotateEnabled) {
      thetaX = 0;
    }
  });
  translateCheck.addEventListener("change", function () {
    translateEnabled = this.checked;
  });
  iterationSlider.addEventListener("input", function () {
    iterations = parseInt(this.value);
    iterationValue.textContent = this.value;
  });
  speedSlider.addEventListener("input", function () {
    animSpeed = parseInt(this.value);
    speedValue.textContent = this.value;
  });
  depthSlider.addEventListener("input", function () {
    EXTRUSION_DEPTH = parseFloat(this.value);
    depthValue.textContent = parseFloat(this.value).toFixed(2);
    // Recreate shapes with new extrusion depth
    shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
    shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");
  });
  colorLInput.addEventListener("input", function () {
    COLOR_L = hexToVec4(this.value);
    shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
  });
  colorOInput.addEventListener("input", function () {
    COLOR_O = hexToVec4(this.value);
    shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");
  });
  colorModeSelect.addEventListener("change", function () {
    let mode = colorModes[this.value];
    COLOR_L = hexToVec4(mode.L);
    colorLInput.value = mode.L;
    COLOR_O = hexToVec4(mode.O);
    colorOInput.value = mode.O;
    shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
    shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");
  });
  bgColorInput.addEventListener("input", function () {
    const hex = hexToVec4(this.value);
    gl.clearColor(hex[0], hex[1], hex[2], hex[3]); // Set canvas background colour
  });

  // Key-down
  window.addEventListener("keydown", function (event) {
    if (event.key === "s" || event.key === "S") {
      startAnimation();
    } else if (event.key === "r" || event.key === "R") {
      stopResetAnimation();
    } else if (isAnimating) {
      // Stop processing if animating
      return;
    } else if (event.key === "x" || event.key === "X") {
      xRotateCheck.checked = !xRotateCheck.checked; // enable: false -> true // disable: true -> false
      xRotateEnabled = xRotateCheck.checked; // rotate if true
      if (!xRotateEnabled) {
        // skip if false (keep rotation) else stop rotation if true
        thetaX = 0;
      }
    } else if (event.key === "y" || event.key === "Y") {
      yRotateCheck.checked = !yRotateCheck.checked;
      yRotateEnabled = yRotateCheck.checked;
      if (!yRotateEnabled) {
        thetaY = 0;
      }
    } else if (event.key === "t" || event.key === "T") {
      translateCheck.checked = !translateCheck.checked;
      translateEnabled = translateCheck.checked;
    } else if (event.key === "l" || event.key === "L") {
      toggleLight();
    }
  });

  //Window resize
  window.addEventListener("resize", resizeCanvas);
}

// Simple light toggle function
function toggleLight() {
  isLightEnabled = !isLightEnabled;
  lightBtn.innerText = "Toggle Light: " + (isLightEnabled ? "ON" : "OFF");
}

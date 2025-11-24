"use strict";

// --- GLOBAL VARIABLES ---
var gl;
var program;
var mvpMatrixLoc;

// Objects to hold buffer data for shapes (L and O)
var shapeL, shapeO;

// Configuration
const EXTRUSION_DEPTH = 0.5;
const COLOR_L = vec4(0.8, 0, 0.2, 1.0); // Reddish
const COLOR_O = vec4(0.2, 0.2, 0.6, 1.0); // Blueish

let animSeq = 0; // Animation sequence
let theta = 0; // Rotation angle in degrees
let thetaY = 0; // Y-axis rotation
let thetaX = 0; // X-axis rotation
let scaleFactor = 1.0; // Scaling factor for the word logo
const maxScale = 2.0; // Target scale for "full-screen" effect
let translateX = 0, translateY = 0; // Translation values
let isAnimating = false;
let yRotateEnabled = false;
let xRotateEnabled = false;
let iterations = 1;
let currentIteration = 0;
let animSpeed = 1;
let additionalAnimPhase = 0;
let translateEnabled = true;

// UI elements
var startBtn, stopBtn, yRotateCheck, xRotateCheck, translateCheck, iterationSlider, iterationValue, speedSlider, speedValue;

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
  gl.clearColor(0.9, 0.9, 0.9, 1.0); // White background
  gl.enable(gl.DEPTH_TEST);

  // Load shaders
  program = initShaders(gl, "vertex-shader", "fragment-shader");
  gl.useProgram(program);

  mvpMatrixLoc = gl.getUniformLocation(program, "uMVP");

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

  // Build Shapes
  shapeL = createExtrudedShape(vertices2D_L, EXTRUSION_DEPTH, COLOR_L, "L");
  shapeO = createExtrudedShape(vertices2D_O, EXTRUSION_DEPTH, COLOR_O, "O");

  // Get UI elements
  startBtn = document.getElementById("startBtn");
  stopBtn = document.getElementById("stopBtn");
  yRotateCheck = document.getElementById("yRotateCheck");
  xRotateCheck = document.getElementById("xRotateCheck");
  translateCheck = document.getElementById("translateCheck");
  iterationSlider = document.getElementById("iterationSlider");
  iterationValue = document.getElementById("iterationValue");
  speedSlider = document.getElementById("speedSlider");
  speedValue = document.getElementById("speedValue");

  // Add event listeners
  startBtn.addEventListener("click", startAnimation);
  stopBtn.addEventListener("click", stopResetAnimation);
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

  // Render the scene
  render();
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
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

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

  // Setup Camera
  const V = lookAt(vec3(1, 4, 9), vec3(0, 0, 0), vec3(0, 1, 0));
  const P = perspective(45, gl.canvas.width / gl.canvas.height, 0.1, 100);
  const VP = mult(P, V);

  if (isAnimating) {
    defaultAnim();
  }

  if (additionalAnimPhase === 1 && xRotateEnabled) {
    thetaX += 2 * animSpeed;
  } else if (additionalAnimPhase === 2 && yRotateEnabled) {
    thetaY += 2 * animSpeed;
  }

  // Apply transformations
  let M = mult(
    translate(translateX, translateY, 0),
    mult(
      rotateX(thetaX),
      mult(
        rotateY(thetaY),
        mult(rotateZ(theta), scale(scaleFactor, scaleFactor, 1))
      )
    )
  );

  // Draw shapes with rotated matrix
  drawShape(shapeL, mult(VP, mult(M, translate(-1.5, 0, 0)))); // Left L
  drawShape(shapeO, mult(VP, mult(M, translate(0, 0, 0)))); // O
  drawShape(shapeL, mult(VP, mult(M, translate(1.5, 0, 0)))); // Right L

  // Animate
  requestAnimationFrame(render);
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

// Returns a 4x4 rotation matrix for rotation around the Z-axis
function rotateZ(degrees) {
  var rad = radians(degrees); // Convert degrees to radians
  var c = Math.cos(rad);
  var s = Math.sin(rad);

  // Rotation matrix around Z-axis
  return mat4(
    vec4(c, -s, 0, 0),
    vec4(s, c, 0, 0),
    vec4(0, 0, 1, 0),
    vec4(0, 0, 0, 1)
  );
}

// Returns a 4x4 rotation matrix for rotation around the Y-axis
function rotateY(degrees) {
  var rad = radians(degrees);
  var c = Math.cos(rad);
  var s = Math.sin(rad);

  return mat4(
    vec4(c, 0, s, 0),
    vec4(0, 1, 0, 0),
    vec4(-s, 0, c, 0),
    vec4(0, 0, 0, 1)
  );
}

// Returns a 4x4 rotation matrix for rotation around the X-axis
function rotateX(degrees) {
  var rad = radians(degrees);
  var c = Math.cos(rad);
  var s = Math.sin(rad);

  return mat4(
    vec4(1, 0, 0, 0),
    vec4(0, c, -s, 0),
    vec4(0, s, c, 0),
    vec4(0, 0, 0, 1)
  );
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
      theta -= 1 * animSpeed;
      if (theta <= -180) animSeq = 1;
      break;

    case 1: // Rotate back to original
      theta += 1 * animSpeed;
      if (theta >= 0) animSeq = 2;
      break;

    case 2: // Rotate to the left by 180 degrees
      theta += 1 * animSpeed;
      if (theta >= 180) animSeq = 3;
      break;

    case 3: // Rotate back to original
      theta -= 1 * animSpeed;
      if (theta <= 0) animSeq = 4;
      break;

    case 4: // Gradually enlarge the word logo to full-screen size
      if (scaleFactor < maxScale) {
        scaleFactor += 0.01 * animSpeed;
      } else {
        animSeq = 5;
      }
      break;

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
        isAnimating = false;
        enableUI();
      }
      break;

    case 6: // Translation complete, move to additional animations
      currentIteration++;
      if (xRotateEnabled) {
        additionalAnimPhase = 1;
        animSeq = 7;
      } else if (yRotateEnabled) {
        additionalAnimPhase = 2;
        animSeq = 8;
      } else {
        // Check if more iterations needed
        if (currentIteration < iterations && translateEnabled) {
          translationStep = 0;
          animSeq = 5;
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
          // Check if more iterations needed
          if (currentIteration < iterations && translateEnabled) {
            additionalAnimPhase = 0;
            translationStep = 0;
            animSeq = 5;
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
        // Check if more iterations needed
        if (currentIteration < iterations && translateEnabled) {
          additionalAnimPhase = 0;
          translationStep = 0;
          animSeq = 5;
        } else {
          isAnimating = false;
          enableUI();
          additionalAnimPhase = 0;
        }
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
}

function enableUI() {
  startBtn.disabled = false;
  yRotateCheck.disabled = false;
  xRotateCheck.disabled = false;
  translateCheck.disabled = false;
  iterationSlider.disabled = false;
  speedSlider.disabled = false;
}

function resetValue() {
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
  yRotateEnabled = false;
  xRotateEnabled = false;
  translateEnabled = true;
  yRotateCheck.checked = false;
  xRotateCheck.checked = false;
  translateCheck.checked = true;
}
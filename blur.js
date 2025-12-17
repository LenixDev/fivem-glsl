const config = {
  resolutionScale: 0.5,
  defaultBlurStrength: 1.0,
  renderColour: [0.0, 0.0, 0.0, 0.0],
  maxBlurSize: 20,
};

const fragmentShaderSrc = `
        precision mediump float;
        varying vec2 v_texcoord;
        uniform sampler2D u_texture;
        uniform vec4 u_shape;
        uniform float u_borderRadius;
        uniform vec2 u_resolution;
        uniform float u_blurStrength;

        const int blurSizing = ${config.maxBlurSize}; 

        float roundedBoxSDF(vec2 centerPosition, vec2 size, float radius) {
          return length(max(abs(centerPosition) - size + radius, 0.0)) - radius;
        }

        float gaussian(float x, float sigma) {
          return exp(-(x * x) / (2.0 * sigma * sigma)) / (sqrt(2.0 * 3.14159) * sigma);
        }

        void main() {
          vec2 pixelCoord = gl_FragCoord.xy;
          vec2 centerPosition = (pixelCoord - u_shape.xy);
          
          float distance = u_shape.w == 0.0
            ? length(centerPosition) - u_shape.z
            : roundedBoxSDF(centerPosition, u_shape.zw, u_borderRadius);
          
          if (distance > 0.0) discard;
          
          vec4 blurredColor = vec4(0.0);
          float totalWeight = 0.0;
          float sigma = u_blurStrength / 3.0;
          
          for (int x = -blurSizing; x <= blurSizing; x++) {
            for (int y = -blurSizing; y <= blurSizing; y++) {
              if (float(x * x + y * y) > u_blurStrength * u_blurStrength) continue;
              vec2 offset = vec2(float(x), float(y)) / u_resolution;
              float weight = gaussian(length(offset), sigma);
              blurredColor += texture2D(u_texture, v_texcoord + offset) * weight;
              totalWeight += weight;
            }
          }
          
          gl_FragColor = blurredColor / totalWeight;
        }
      `;

const vertexShaderSrc = `
        attribute vec2 a_position;
        attribute vec2 a_texcoord;
        varying vec2 v_texcoord;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          v_texcoord = a_texcoord;
        }
      `;

function makeShader(gl, type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  const infoLog = gl.getShaderInfoLog(shader);
  if (infoLog) console.error(infoLog);
  return shader;
}

function createTexture(gl) {
  const tex = gl.createTexture();
  const texPixels = new Uint8Array([0, 0, 255, 255]);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, texPixels);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createBuffers(gl) {
  const vertexBuff = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuff);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const texBuff = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuff);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

  return { vertexBuff, texBuff };
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, makeShader(gl, gl.VERTEX_SHADER, vertexShaderSrc));
  gl.attachShader(program, makeShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
    return null;
  }

  return {
    program,
    attribLocations: {
      position: gl.getAttribLocation(program, 'a_position'),
      texcoord: gl.getAttribLocation(program, 'a_texcoord'),
    },
    uniformLocations: {
      shape: gl.getUniformLocation(program, 'u_shape'),
      borderRadius: gl.getUniformLocation(program, 'u_borderRadius'),
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      blurStrength: gl.getUniformLocation(program, 'u_blurStrength'),
    },
  };
}

// MODIFIED: Changed to accept a NodeList/Array that can be updated dynamically
function createGameView(canvas, glassElements, resolutionScale = config.resolutionScale) {
  const gl = canvas.getContext('webgl', {
    antialias: false,
    depth: false,
    stencil: false,
    alpha: true,
    preserveDrawingBuffer: true,
    failIfMajorPerformanceCaveat: false
  });

  const tex = createTexture(gl);
  const programInfo = createProgram(gl);
  const { vertexBuff, texBuff } = createBuffers(gl);

  if (!programInfo) {
    console.error('Failed to create shader program');
    return null;
  }

  gl.useProgram(programInfo.program);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(gl.getUniformLocation(programInfo.program, 'u_texture'), 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuff);
  gl.vertexAttribPointer(programInfo.attribLocations.position, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programInfo.attribLocations.position);

  gl.bindBuffer(gl.ARRAY_BUFFER, texBuff);
  gl.vertexAttribPointer(programInfo.attribLocations.texcoord, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programInfo.attribLocations.texcoord);

  let currentResolutionScale = resolutionScale;
  // ADDED: Store reference to elements array that can be updated
  let currentElements = glassElements;

  function render() {
    const canvasRect = canvas.getBoundingClientRect();
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(programInfo.program);

    // MODIFIED: Use currentElements instead of glassElements directly
    currentElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const buffer = 1;
      const scaledLeft = Math.floor((rect.left - canvasRect.left) * currentResolutionScale) - buffer;
      const scaledTop = Math.floor((rect.top - canvasRect.top) * currentResolutionScale) - buffer;
      const scaledWidth = Math.ceil(rect.width * currentResolutionScale) + buffer * 2;
      const scaledHeight = Math.ceil(rect.height * currentResolutionScale) + buffer * 2;

      const centerX = scaledLeft + scaledWidth / 2;
      const centerY = gl.canvas.height - (scaledTop + scaledHeight / 2);

      const borderRadius = parseFloat(getComputedStyle(element).borderRadius);
      const isCircle = getComputedStyle(element).borderRadius.includes('%') &&
        parseFloat(getComputedStyle(element).borderRadius) >= 50;

      gl.uniform4f(programInfo.uniformLocations.shape, centerX, centerY,
        isCircle ? scaledWidth / 2 : scaledWidth / 2,
        isCircle ? 0 : scaledHeight / 2);
      gl.uniform1f(programInfo.uniformLocations.borderRadius, borderRadius * currentResolutionScale);
      gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
      const blurStrength = parseFloat(element.dataset.blurStrength) || config.defaultBlurStrength;

      gl.uniform4f(programInfo.uniformLocations.shape, centerX, centerY,
        isCircle ? scaledWidth / 2 : scaledWidth / 2,
        isCircle ? 0 : scaledHeight / 2);
      gl.uniform1f(programInfo.uniformLocations.borderRadius, borderRadius * currentResolutionScale);
      gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);
      gl.uniform1f(programInfo.uniformLocations.blurStrength, blurStrength);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });

    requestAnimationFrame(render);
  }

  return {
    canvas,
    gl,
    resize: (width, height) => {
      const scaledWidth = Math.ceil(width * currentResolutionScale);
      const scaledHeight = Math.ceil(height * currentResolutionScale);

      canvas.width = scaledWidth;
      canvas.height = scaledHeight;

      gl.viewport(0, 0, scaledWidth, scaledHeight);
    },
    setResolutionScale: (scale) => {
      currentResolutionScale = scale;
      gameView.resize(window.innerWidth, window.innerHeight);
    },
    // ADDED: Method to update the elements being rendered
    updateElements: (newElements) => {
      currentElements = newElements;
    },
    start: () => {
      gl.clearColor(...config.renderColour);
      render();
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const body = document.body;
  let canvas = null;
  let gameView = null;
  // ADDED: Set to track all processed elements and prevent duplicates
  const trackedElements = new Set();

  // ADDED: Initialize canvas once and reuse it
  const initCanvas = () => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'render';
      Object.assign(canvas.style, {
        position: 'absolute',
        width: '100%',
      });
      body.insertBefore(canvas, body.firstChild);
    }
    return canvas;
  };

  // ADDED: Process a single element (extract blur strength and add to tracked set)
  const processElement = (element) => {
    // Skip if already processed
    if (trackedElements.has(element)) return;
    
    element.classList.add('relative');
    const classMatch = [...element.classList].find(c => c.startsWith("blured-"));
    let blured = config.defaultBlurStrength;
    
    if (classMatch) {
      const extractedValue = classMatch.replace("blured-", "");
      if (!isNaN(extractedValue) && extractedValue.trim() !== "") {
        blured = parseFloat(extractedValue);
      }
    }
    
    element.dataset.blurStrength = blured.toString();
    // Add to tracked set so we don't process it again
    trackedElements.add(element);
  };

  // ADDED: Remove element from tracking when blur class is removed
  const removeElement = (element) => {
    if (trackedElements.has(element)) {
      trackedElements.delete(element);
      delete element.dataset.blurStrength;
      return true;
    }
    return false;
  };

  // ADDED: Process all current blur elements in the DOM
  const processAllElements = () => {
    const glassElements = document.querySelectorAll('[class*="blured"]');
    
    // ADDED: Remove elements that no longer have blur class
    trackedElements.forEach(element => {
      const hasBlurClass = Array.from(element.classList).some(c => c.includes('blured'));
      if (!hasBlurClass) {
        removeElement(element);
      }
    });
    
    if (glassElements.length > 0) {
      // Initialize canvas and gameView on first run
      if (!gameView) {
        const canvasEl = initCanvas();
        glassElements.forEach(processElement);
        
        // Create gameView with current tracked elements
        gameView = createGameView(canvasEl, Array.from(trackedElements));
        
        if (gameView) {
          const updateSize = () => gameView.resize(window.innerWidth, window.innerHeight);
          updateSize();
          window.addEventListener('resize', updateSize);
          gameView.start();
        }
      } else {
        // If gameView already exists, just process new elements
        glassElements.forEach(processElement);
        // Update gameView with all tracked elements
        gameView.updateElements(Array.from(trackedElements));
      }
    } else if (gameView) {
      // ADDED: If no blur elements exist, update with empty array
      gameView.updateElements(Array.from(trackedElements));
    }
  };

  // MODIFIED: Initial processing of existing elements
  processAllElements();

  // ADDED: MutationObserver to watch for new elements being added to DOM
  const observer = new MutationObserver((mutations) => {
    let hasNewBlurElements = false;

    mutations.forEach((mutation) => {
      // Check for newly added nodes
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node;
          
          // Check if the added node itself has blur class
          if (element.classList && Array.from(element.classList).some(c => c.includes('blured'))) {
            processElement(element);
            hasNewBlurElements = true;
          }
          
          // Check if added node has children with blur class
          const children = element.querySelectorAll('[class*="blured"]');
          if (children.length > 0) {
            children.forEach(processElement);
            hasNewBlurElements = true;
          }
        }
      });

      // ADDED: Handle class attribute changes on existing elements
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        // If class was added that contains 'blured', process the element
        if (Array.from(target.classList).some(c => c.includes('blured'))) {
          processElement(target);
          hasNewBlurElements = true;
        }
      }
    });

    // ADDED: Update gameView if new blur elements were detected
    if (hasNewBlurElements && gameView) {
      gameView.updateElements(Array.from(trackedElements));
    }
  });

  // ADDED: Start observing the entire document for changes
  observer.observe(body, {
    childList: true,        // Watch for added/removed children
    subtree: true,          // Watch all descendants, not just direct children
    attributes: true,       // Watch for attribute changes
    attributeFilter: ['class'] // Only watch class attribute changes (optimization)
  });

  // ADDED: Cleanup observer on page unload (good practice)
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
  });

  // ADDED: Expose function to manually trigger blur processing
  // This allows other scripts to force re-scan after dynamically adding blur classes
  window.refreshBlurElements = () => {
    processAllElements();
  };
});
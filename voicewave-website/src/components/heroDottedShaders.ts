export const heroFullscreenVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const heroSimulationFragmentShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uPrev;
  uniform vec2 uPointer;
  uniform vec2 uPointerDelta;
  uniform float uPointerActive;
  uniform float uTime;
  uniform float uDt;
  uniform float uDecay;
  uniform float uAmbientStrength;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec4 previous = texture2D(uPrev, vUv);
    vec2 velocity = previous.gb - 0.5;

    vec2 ambientDrift = vec2(
      sin(vUv.y * 10.0 + uTime * 0.27) + cos(vUv.x * 9.0 - uTime * 0.33),
      cos(vUv.x * 11.0 - uTime * 0.22) - sin(vUv.y * 7.0 + uTime * 0.31)
    ) * 0.0021;

    vec2 advectUv = clamp(vUv - velocity * 0.020 - ambientDrift, 0.0, 1.0);
    vec4 advected = texture2D(uPrev, advectUv);

    float field = advected.r * uDecay;
    velocity = mix(advected.gb - 0.5, ambientDrift * 14.0, 0.06);

    vec2 uvTop = vec2(vUv.x, 1.0 - vUv.y);
    float pointerDist = distance(uvTop, uPointer);
    float impulse = exp(-pointerDist * pointerDist * 185.0) * uPointerActive;

    field += impulse * 0.92;
    velocity += uPointerDelta * impulse * 0.74;

    float sparkle = hash12(floor(vUv * 280.0) + floor(uTime * 0.82));
    field += uAmbientStrength * (0.58 + sparkle * 0.42) * uDt;

    field = clamp(field, 0.0, 1.0);
    velocity = clamp(velocity, vec2(-0.5), vec2(0.5));

    gl_FragColor = vec4(field, velocity + 0.5, 1.0);
  }
`

export const heroDisplayFragmentShader = `
  precision highp float;

  varying vec2 vUv;

  uniform sampler2D uField;
  uniform vec2 uResolution;
  uniform vec2 uPointer;
  uniform float uPointerActive;
  uniform float uTime;
  uniform float uDotSize;
  uniform float uDotGap;
  uniform float uMaskStrength;
  uniform float uPointerRadius;
  uniform float uPointerStrength;
  uniform vec2 uSafeCenterPx;
  uniform float uSafeRadiusPx;
  uniform float uSafeFeatherPx;
  uniform float uTopCutoffPx;
  uniform vec3 uColorPrimary;
  uniform vec3 uColorSecondary;
  uniform vec3 uColorHighlight;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    vec2 fragPx = gl_FragCoord.xy;
    vec2 fragTopPx = vec2(fragPx.x, uResolution.y - fragPx.y);
    vec2 uv = fragTopPx / uResolution;
    vec4 fluid = texture2D(uField, vUv + vec2(sin(uTime * 0.18 + vUv.y * 6.0), cos(uTime * 0.16 + vUv.x * 7.5)) * 0.0012);
    float field = fluid.r;
    float flow = length(fluid.gb - 0.5) * 2.0;

    float pointerRadius = max(1.0, uPointerRadius);
    float pointerFalloff = exp(-pow(distance(uv, uPointer), 2.0) * pointerRadius) * uPointerActive * uPointerStrength;

    float horizontalBand = exp(-pow((uv.x - 0.5) / 0.50, 2.0));
    float verticalBand = smoothstep(0.035, 0.13, uv.y) * (1.0 - smoothstep(0.90, 0.985, uv.y));
    float lowerLift = exp(-pow((uv.y - 0.66) / 0.32, 2.0));
    float structure = clamp(horizontalBand * verticalBand * (0.72 + 0.28 * lowerLift), 0.0, 1.0);

    float distanceToSafe = distance(fragTopPx, uSafeCenterPx);
    float cellSize = max(5.5, uDotSize + uDotGap);
    vec2 tile = fract(fragPx / cellSize) - 0.5;
    float distInCell = length(tile);
    vec2 gridCell = floor(fragPx / cellSize);
    float cellNoise = hash12(gridCell);
    float edgeNoise = hash12(gridCell * 1.13 + 91.0) - 0.5;

    float edgeJitterPx = edgeNoise * 20.0;
    float safeOuter = uSafeRadiusPx + max(58.0, uSafeFeatherPx + 38.0);
    float safeBlend = smoothstep(uSafeRadiusPx - 52.0 + edgeJitterPx, safeOuter + edgeJitterPx, distanceToSafe);
    float safeDynamicZone = smoothstep(
      uSafeRadiusPx + 12.0 + edgeJitterPx * 0.35,
      uSafeRadiusPx + uSafeFeatherPx + 42.0 + edgeJitterPx * 0.35,
      distanceToSafe
    );
    safeBlend = clamp(safeBlend, 0.0, 1.0);
    safeDynamicZone = clamp(safeDynamicZone, 0.0, 1.0);
    float safeStaticZone = mix(0.86, 1.0, safeBlend);
    float topZone = smoothstep(uTopCutoffPx - 2.0, uTopCutoffPx + 8.0, fragTopPx.y);
    float pointerZone = safeDynamicZone;
    float activePointer = pointerFalloff * pointerZone;

    float dynamicEnergy = (field * 0.95 + flow * 0.52 + structure * 0.54 + activePointer * 0.86) * safeDynamicZone;
    float staticPattern = 0.42 + 0.58 * hash12(gridCell * 0.91 + 17.0);
    float staticEnergy = (0.16 + structure * 0.24 + staticPattern * 0.24) * safeStaticZone;
    float energy = clamp(dynamicEnergy + staticEnergy * 0.52, 0.0, 1.0);
    float activity = clamp(activePointer * 1.35 + flow * 0.70 + field * 0.55, 0.0, 1.0);
    float idleFade = mix(0.42, 1.0, activity);

    float radius = mix(0.11, 0.33, energy) + activePointer * 0.18;
    float dot = 1.0 - smoothstep(radius, radius + 0.075, distInCell);

    float dynamicTwinkle = 0.82 + 0.18 * sin(uTime * 1.8 + cellNoise * 6.2831853);
    float staticTwinkle = 0.95 + 0.05 * sin(uTime * 0.42 + cellNoise * 4.0);
    float dynamicAlpha = dot * dynamicTwinkle * (0.08 + dynamicEnergy * 0.82) * safeDynamicZone;
    float staticAlpha = dot * staticTwinkle * (0.06 + staticEnergy * 0.36) * safeStaticZone;
    float blendDust = dot
      * (0.010 + cellNoise * 0.010)
      * (1.0 - safeBlend)
      * smoothstep(uSafeRadiusPx - 58.0, uSafeRadiusPx + 36.0, distanceToSafe);
    float alpha = (dynamicAlpha + staticAlpha + blendDust) * structure;
    alpha *= idleFade;
    alpha *= mix(1.0, safeStaticZone, uMaskStrength);
    alpha *= topZone;
    alpha *= 1.0 - smoothstep(0.95, 1.0, uv.y);

    vec3 color = mix(uColorPrimary, uColorSecondary, clamp(energy * 1.05, 0.0, 1.0));
    color = mix(color, uColorHighlight, clamp(activePointer + field * 0.24, 0.0, 1.0));

    gl_FragColor = vec4(color, alpha);
  }
`

import React, { useEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import * as THREE from "three";
import { Camera, Hand, Flower, Zap, Maximize, Settings2, Palette } from "lucide-react";

// Types for MediaPipe (global script injection)
declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

// Configuration
const PARTICLE_COUNT = 4000;
const CAMERA_FOV = 60;

// Shapes Generator
const generateShape = (type: string, count: number): Float32Array => {
  const positions = new Float32Array(count * 3);
  
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    let x = 0, y = 0, z = 0;

    if (type === 'heart') {
      // 3D Heart Approximation
      const t = Math.random() * Math.PI * 2;
      const u = Math.random() * Math.PI; // slice 
      // A mix of parametric curves to create volume
      const r = 2; 
      // Basic parametric heart curve
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
      // Add volume Z
      const scale = 0.25;
      x = hx * scale;
      y = hy * scale;
      z = (Math.random() - 0.5) * 5 * Math.sin(t); // Varying thickness
      
      // Randomize inside slightly
      const dist = Math.random();
      x *= dist;
      y *= dist;
      z *= dist;

    } else if (type === 'flower') {
      // Rose Curve / Flower
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const k = 4; // number of petals
      const r = 3 * Math.cos(k * theta) + 1; // Petal shape
      
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.cos(phi);
      z = r * Math.sin(phi) * Math.sin(theta);
      
      // Flatten slightly to look like a flower head
      y *= 0.5;

    } else if (type === 'fireworks') {
      // Sphere / Explosion
      const r = 4 * Math.cbrt(Math.random()); // Even distribution in sphere
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      
      x = r * Math.sin(phi) * Math.cos(theta);
      y = r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    }

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;
  }
  
  return positions;
};

const App = () => {
  const [activeShape, setActiveShape] = useState<'heart' | 'flower' | 'fireworks'>('heart');
  const [particleColor, setParticleColor] = useState('#ff3366');
  const [handStatus, setHandStatus] = useState<'detected' | 'searching'>('searching');
  const [gestureValue, setGestureValue] = useState(0); // 0 (closed) to 1 (open)
  
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Refs for animation loop to access latest state without re-rendering
  const stateRef = useRef({
    shape: 'heart',
    targetPositions: generateShape('heart', PARTICLE_COUNT),
    gestureFactor: 1.0, // Multiplier for scale/spread
    color: new THREE.Color('#ff3366')
  });

  // Update refs when React state changes
  useEffect(() => {
    stateRef.current.shape = activeShape;
    stateRef.current.targetPositions = generateShape(activeShape, PARTICLE_COUNT);
  }, [activeShape]);

  useEffect(() => {
    stateRef.current.color.set(particleColor);
  }, [particleColor]);

  // Three.js & MediaPipe Initialization
  useEffect(() => {
    if (!mountRef.current) return;

    // --- THREE.JS SETUP ---
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050505, 0.03);

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 100);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Particles
    const geometry = new THREE.BufferGeometry();
    const currentPositions = new Float32Array(PARTICLE_COUNT * 3);
    // Initialize current positions randomly
    for(let i=0; i<currentPositions.length; i++) currentPositions[i] = (Math.random() - 0.5) * 10;
    
    geometry.setAttribute('position', new THREE.BufferAttribute(currentPositions, 3));
    
    // Shader/Material
    const material = new THREE.PointsMaterial({
      color: stateRef.current.color,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Animation Loop
    let animationId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();
      
      // Update Color
      material.color.lerp(stateRef.current.color, 0.1);

      // Access attributes
      const positions = geometry.attributes.position.array as Float32Array;
      const target = stateRef.current.targetPositions;
      
      // Gesture Control Smoothing
      // If hand is closed (factor 0), we shrink or condense
      // If hand is open (factor 1), we expand to full shape
      const targetScale = 0.2 + (stateRef.current.gestureFactor * 0.8); 
      
      // Dynamic movement
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        
        // Target coordinates based on shape
        let tx = target[i3];
        let ty = target[i3 + 1];
        let tz = target[i3 + 2];

        // Apply Gesture Scaling
        // Fireworks behave differently: they explode outward
        if (stateRef.current.shape === 'fireworks') {
           const explosionFactor = 0.5 + (stateRef.current.gestureFactor * 2.5);
           tx *= explosionFactor;
           ty *= explosionFactor;
           tz *= explosionFactor;
           
           // Add rotation to fireworks
           const rotSpeed = 0.2;
           const x = tx * Math.cos(time * rotSpeed) - tz * Math.sin(time * rotSpeed);
           const z = tx * Math.sin(time * rotSpeed) + tz * Math.cos(time * rotSpeed);
           tx = x; tz = z;
        } else {
           // Heart and Flower breathe/scale
           tx *= targetScale;
           ty *= targetScale;
           tz *= targetScale;
        }

        // Add some noise/life
        tx += Math.sin(time * 2 + i) * 0.05;
        ty += Math.cos(time * 1.5 + i) * 0.05;

        // Lerp current position to target
        positions[i3] += (tx - positions[i3]) * 0.08;
        positions[i3 + 1] += (ty - positions[i3 + 1]) * 0.08;
        positions[i3 + 2] += (tz - positions[i3 + 2]) * 0.08;
      }
      
      geometry.attributes.position.needsUpdate = true;
      
      // Rotate entire system slowly
      particles.rotation.y = time * 0.05;
      
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // --- MEDIAPIPE SETUP ---
    const onResults = (results: any) => {
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setHandStatus('detected');
        const landmarks = results.multiHandLandmarks[0];
        
        // Calculate distance between Thumb Tip (4) and Index Tip (8)
        const thumb = landmarks[4];
        const index = landmarks[8];
        const dist = Math.sqrt(
          Math.pow(thumb.x - index.x, 2) + 
          Math.pow(thumb.y - index.y, 2) + 
          Math.pow(thumb.z - index.z, 2)
        );

        // Normalize distance: 0.05 (pinch) to 0.15 (open) approx ranges in MP coords
        let factor = (dist - 0.03) / 0.15;
        factor = Math.max(0, Math.min(1, factor)); // Clamp 0-1
        
        // Smooth update ref
        stateRef.current.gestureFactor += (factor - stateRef.current.gestureFactor) * 0.2;
        
        // Update UI state less frequently to avoid lag
        if (Math.abs(factor - gestureValue) > 0.05) {
            setGestureValue(factor);
        }

      } else {
        setHandStatus('searching');
        // Auto breathe if no hand
        const time = Date.now() / 1000;
        const autoFactor = (Math.sin(time * 2) + 1) / 2;
        stateRef.current.gestureFactor += (autoFactor - stateRef.current.gestureFactor) * 0.05;
      }
    };

    let hands: any;
    let cameraUtils: any;

    const initMediaPipe = async () => {
      if (!window.Hands) {
        setTimeout(initMediaPipe, 100);
        return;
      }

      hands = new window.Hands({locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }});
      
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      
      hands.onResults(onResults);

      if (videoRef.current) {
        cameraUtils = new window.Camera(videoRef.current, {
          onFrame: async () => {
            await hands.send({image: videoRef.current});
          },
          width: 640,
          height: 480
        });
        cameraUtils.start();
      }
    };

    initMediaPipe();

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
      mountRef.current?.removeChild(renderer.domElement);
      // Clean up MediaPipe if possible
      if (cameraUtils) {
          // cameraUtils.stop() // Note: Camera Utils in some versions doesn't have stop, depends on CDN version
      }
    };
  }, []); // Run once on mount

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Three.js Container */}
      <div ref={mountRef} className="absolute inset-0 z-0" />
      
      {/* Hidden Video Element for MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* UI Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-white text-2xl font-bold tracking-tighter drop-shadow-lg">
              Particle<span className="text-blue-500">Flux</span>
            </h1>
            <p className="text-gray-400 text-sm mt-1">AI Gesture Control System</p>
          </div>
          
          <div className="flex items-center gap-2">
             <div className={`px-3 py-1 rounded-full text-xs font-mono flex items-center gap-2 backdrop-blur-md border ${handStatus === 'detected' ? 'bg-green-500/20 border-green-500/50 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                <div className={`w-2 h-2 rounded-full ${handStatus === 'detected' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                {handStatus === 'detected' ? 'HAND DETECTED' : 'SEARCHING HAND...'}
             </div>
             <button onClick={toggleFullscreen} className="pointer-events-auto p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur transition text-white">
                <Maximize size={20} />
             </button>
          </div>
        </div>

        {/* Status Indicator (Debug Visual) */}
        {handStatus === 'detected' && (
             <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                 <div 
                   className="border-2 border-white rounded-full transition-all duration-75 ease-linear"
                   style={{
                     width: `${100 + gestureValue * 200}px`,
                     height: `${100 + gestureValue * 200}px`,
                   }}
                 />
             </div>
        )}

        {/* Controls Panel */}
        <div className="flex justify-center mb-8 pointer-events-auto">
          <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col md:flex-row gap-6 items-center w-full max-w-2xl">
             
             {/* Shape Selectors */}
             <div className="flex gap-2">
                <button 
                  onClick={() => setActiveShape('heart')}
                  className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[80px] transition-all ${activeShape === 'heart' ? 'bg-pink-500/20 text-pink-300 border border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'hover:bg-white/5 text-gray-400'}`}
                >
                  <Flower size={24} className={activeShape === 'heart' ? 'fill-pink-500/20' : ''} />
                  <span className="text-xs font-medium">Heart</span>
                </button>
                
                <button 
                  onClick={() => setActiveShape('flower')}
                  className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[80px] transition-all ${activeShape === 'flower' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'hover:bg-white/5 text-gray-400'}`}
                >
                  <Zap size={24} className={activeShape === 'flower' ? 'fill-purple-500/20' : ''} />
                  <span className="text-xs font-medium">Rose</span>
                </button>

                <button 
                  onClick={() => setActiveShape('fireworks')}
                  className={`p-3 rounded-xl flex flex-col items-center gap-1 min-w-[80px] transition-all ${activeShape === 'fireworks' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'hover:bg-white/5 text-gray-400'}`}
                >
                  <Settings2 size={24} className={activeShape === 'fireworks' ? 'fill-yellow-500/20' : ''} />
                  <span className="text-xs font-medium">Sparks</span>
                </button>
             </div>

             <div className="w-px h-12 bg-white/10 hidden md:block"></div>

             {/* Color Picker */}
             <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="bg-white/5 p-2 rounded-lg">
                  <Palette size={20} className="text-gray-300" />
                </div>
                <div className="flex flex-col flex-1">
                  <label className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Particle Color</label>
                  <div className="flex gap-2">
                    {['#ff3366', '#a855f7', '#3b82f6', '#22c55e', '#eab308', '#ffffff'].map(c => (
                        <button 
                          key={c}
                          onClick={() => setParticleColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${particleColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                    ))}
                    <input 
                      type="color" 
                      value={particleColor}
                      onChange={(e) => setParticleColor(e.target.value)}
                      className="w-6 h-6 rounded-full overflow-hidden opacity-0 absolute ml-[8.5rem] cursor-pointer"
                    />
                    <div className="w-6 h-6 rounded-full border border-white/20 bg-gradient-to-br from-gray-700 to-black flex items-center justify-center text-[8px] text-gray-400 cursor-pointer pointer-events-none">+</div>
                  </div>
                </div>
             </div>

          </div>
        </div>

        {/* Instruction Toast */}
        <div className={`absolute bottom-32 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10 text-white/80 text-sm transition-opacity duration-1000 ${handStatus === 'detected' ? 'opacity-0' : 'opacity-100'}`}>
          Show your hand to the camera to control particles
        </div>

      </div>
    </div>
  );
};

const container = document.getElementById("root");
const root = createRoot(container!);
root.render(<App />);

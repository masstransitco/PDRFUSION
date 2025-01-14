import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { DragControls } from "three/examples/jsm/controls/DragControls";

import { useAppSelector, useAppDispatch } from "../store";
import { setStartingPosition } from "../store/sensorSlice";

interface ThreeDSceneProps {
  userPosition: {
    x: number; // e.g. east-west in PDR
    y: number; // e.g. north-south in PDR
    z: number; // optional altitude
  };
}

export function ThreeDScene({ userPosition }: ThreeDSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const dragControlsRef = useRef<DragControls | null>(null);

  // Pin group (selectingStart) & Arrow group (startPointSelected)
  const pinGroupRef = useRef<THREE.Group | null>(null);
  const arrowGroupRef = useRef<THREE.Group | null>(null);

  // Floor plan mesh ref (if you want to remove or manipulate it later)
  const floorPlanRef = useRef<THREE.Mesh | null>(null);

  // Trail
  const trailRef = useRef<THREE.Line | null>(null);
  const trailPointsRef = useRef<THREE.Vector3[]>([]);

  // From Redux
  const { userState, orientationAngle, dragMode } = useAppSelector((state) => state.sensor);
  const dispatch = useAppDispatch();

  const SCALE_FACTOR = 0.05;
  const MAX_TRAIL_POINTS = 100;

  // State to track if we have already added the floor plan to the scene
  const [hasChosenFloorPlan, setHasChosenFloorPlan] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 20, 20);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(50, 50);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Grid + cardinal labels
    const grid = new THREE.GridHelper(50, 50);
    scene.add(grid);

    const labelN = createTextSprite("N", "#fff");
    labelN.position.set(0, 0.1, 25);
    scene.add(labelN);

    const labelE = createTextSprite("E", "#fff");
    labelE.position.set(25, 0.1, 0);
    scene.add(labelE);

    const labelS = createTextSprite("S", "#fff");
    labelS.position.set(0, 0.1, -25);
    scene.add(labelS);

    const labelW = createTextSprite("W", "#fff");
    labelW.position.set(-25, 0.1, 0);
    scene.add(labelW);

    // Pin Group
    const pinGroup = new THREE.Group();
    scene.add(pinGroup);
    pinGroupRef.current = pinGroup;

    // Red sphere + cylinder
    const pinSphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const pinSphereMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const pinSphere = new THREE.Mesh(pinSphereGeo, pinSphereMat);
    pinSphere.position.set(0, 0.5, 0);
    pinGroup.add(pinSphere);

    const pinGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x999999 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.set(0, 0, 0);
    pinGroup.add(pinMesh);

    // Arrow Group
    const arrowGroup = new THREE.Group();
    scene.add(arrowGroup);
    arrowGroupRef.current = arrowGroup;

    const arrowGeo = new THREE.ConeGeometry(0.3, 0.8, 8);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.position.set(0, 0.5, 0);
    arrowMesh.rotation.x = Math.PI / 2; 
    arrowGroup.add(arrowMesh);

    // Trail line
    const trailMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const trailGeometry = new THREE.BufferGeometry();
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    scene.add(trailLine);
    trailRef.current = trailLine;

    // Orbit & Drag
    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControlsRef.current = orbitControls;

    const dragControls = new DragControls([pinGroup], camera, renderer.domElement);
    dragControlsRef.current = dragControls;

    dragControls.addEventListener("dragstart", () => {
      orbitControls.enabled = false;
    });
    dragControls.addEventListener("drag", (event) => {
      event.object.position.y = 0;
    });
    dragControls.addEventListener("dragend", (event) => {
      orbitControls.enabled = true;
      const { x, z } = event.object.position;
      const realX = x / SCALE_FACTOR;
      const realY = z / SCALE_FACTOR;
      dispatch(setStartingPosition({ x: realX, y: realY, z: 0 }));
    });
    dragControls.enabled = false;

    // Animate
    const animate = () => {
      requestAnimationFrame(animate);
      orbitControls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      renderer.dispose();
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [dispatch]);

  // Function to add the "502" floor plan geometry
 const handleChooseFloorPlan = () => {
  if (!sceneRef.current || hasChosenFloorPlan) return;

  // 1) Define shapePoints from the corners of 502
  const shapePoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(4.74, 0),
    new THREE.Vector2(4.74, 5.09),
    new THREE.Vector2(1.66, 5.09),
    new THREE.Vector2(1.66, 6.75),
    new THREE.Vector2(0, 6.75),
    // Add more corners if needed
  ];
  const shape = new THREE.Shape(shapePoints);

  // 2) Extrude or create shape geometry
  const extrudeSettings = { depth: 0.05, bevelEnabled: false };
  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // OR for a truly flat plan:
  // const geom = new THREE.ShapeGeometry(shape);

  // 3) Create material, mesh, and scale
  const mat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
  const floorPlanMesh = new THREE.Mesh(geom, mat);

  floorPlanMesh.scale.set(SCALE_FACTOR, SCALE_FACTOR, SCALE_FACTOR);
  floorPlanMesh.rotation.x = -Math.PI / 2; // lay it flat
  floorPlanMesh.position.set(0, 0.01, 0);

  sceneRef.current.add(floorPlanMesh);
  floorPlanRef.current = floorPlanMesh;
  setHasChosenFloorPlan(true);
};
  
  // Update the trail line
  const updateTrail = (pos: THREE.Vector3) => {
    trailPointsRef.current.push(new THREE.Vector3(pos.x, 0.1, pos.z));
    if (trailPointsRef.current.length > MAX_TRAIL_POINTS) {
      trailPointsRef.current.shift();
    }
    if (trailRef.current) {
      const geometry = new THREE.BufferGeometry().setFromPoints(trailPointsRef.current);
      trailRef.current.geometry.dispose();
      trailRef.current.geometry = geometry;
    }
  };

  // 1) Show/hide pin & arrow
  useEffect(() => {
    if (!pinGroupRef.current || !arrowGroupRef.current) return;

    if (userState === "selectingStart") {
      pinGroupRef.current.visible = true;
      arrowGroupRef.current.visible = false;

      // Clear trail
      trailPointsRef.current = [];
      if (trailRef.current) {
        trailRef.current.geometry.dispose();
        trailRef.current.geometry = new THREE.BufferGeometry();
      }
      pinGroupRef.current.position.set(0, 0, 0);
    } else {
      // "startPointSelected"
      pinGroupRef.current.visible = false;
      arrowGroupRef.current.visible = true;
    }
  }, [userState]);

  // 2) Position arrow from userPosition
  useEffect(() => {
    if (!arrowGroupRef.current) return;
    if (userState === "startPointSelected") {
      const arrowPos = new THREE.Vector3(
        userPosition.x * SCALE_FACTOR,
        0,
        userPosition.y * SCALE_FACTOR
      );
      arrowGroupRef.current.position.copy(arrowPos);

      updateTrail(arrowPos);
    }
  }, [userPosition, userState]);

  // 3) Rotate arrow for heading
  useEffect(() => {
    if (!arrowGroupRef.current) return;
    if (userState === "startPointSelected") {
      const headingRad = THREE.MathUtils.degToRad(orientationAngle);
      arrowGroupRef.current.rotation.y = headingRad;
    }
  }, [orientationAngle, userState]);

  // 4) Drag => only if "selectingStart"
  useEffect(() => {
    if (!dragControlsRef.current) return;
    dragControlsRef.current.enabled = userState === "selectingStart" && dragMode;
  }, [dragMode, userState]);

  return (
    <div style={{ position: "relative" }}>
      {/* The main Three.js mount point */}
      <div
        ref={mountRef}
        style={{
          width: "100%",
          height: "60vh",
          margin: "0 auto",
          overflow: "hidden"
        }}
      />
      {/* A simple button to choose the floor plan */}
      <button
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 10,
          padding: "8px 12px"
        }}
        onClick={handleChooseFloorPlan}
      >
        Choose Scene: 502, 5/F. New Landwide Commercial Building
      </button>
    </div>
  );
}

function createTextSprite(text: string, color: string) {
  const canvas = document.createElement("canvas");
  const size = 64;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = color;
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, size / 2, size / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(2, 2, 1);
  return sprite;
}

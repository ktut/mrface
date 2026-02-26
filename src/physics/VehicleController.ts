import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const CHASSIS_HALF_EXTENTS = { x: 0.6, y: 0.25, z: 0.4 };
const WHEEL_RADIUS = 0.22;
const WHEEL_REST_LENGTH = 0.2;
const SUSPENSION_STIFFNESS = 50;
const SUSPENSION_DAMPING_COMPRESSION = 2.3;
const SUSPENSION_DAMPING_RELAXATION = 4.4;
const MAX_ENGINE_FORCE = 18;
const MAX_BRAKE = 30;
const MAX_STEER_RAD = Math.PI / 6;
/** Linear damping so the kart slows to a stop when gas is not held. */
const LINEAR_DAMPING = 2.5;

export class VehicleController {
  private world: RAPIER.World;
  private vehicle: RAPIER.DynamicRayCastVehicleController;
  private chassisBody: RAPIER.RigidBody;
  constructor(world: RAPIER.World) {
    this.world = world;
    const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 1, 0)
      // Only allow rotation around Y (steering); prevent roll/pitch so gas doesn't spin the kart.
      .enabledRotations(false, true, false);
    this.chassisBody = world.createRigidBody(chassisDesc);
    this.chassisBody.setLinearDamping(LINEAR_DAMPING);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      CHASSIS_HALF_EXTENTS.x,
      CHASSIS_HALF_EXTENTS.y,
      CHASSIS_HALF_EXTENTS.z,
    );
    world.createCollider(colliderDesc, this.chassisBody);

    this.vehicle = world.createVehicleController(this.chassisBody);
    this.vehicle.indexUpAxis = 1;
    (this.vehicle as { setIndexForwardAxis?: number }).setIndexForwardAxis = 2;

    const hx = CHASSIS_HALF_EXTENTS.x;
    const hy = CHASSIS_HALF_EXTENTS.y;
    const hz = CHASSIS_HALF_EXTENTS.z;
    const connectionY = -hy - WHEEL_REST_LENGTH * 0.5;
    const direction = { x: 0, y: -1, z: 0 };
    const axleX = { x: 1, y: 0, z: 0 };

    this.vehicle.addWheel(
      { x: hx - 0.1, y: connectionY, z: hz - 0.1 },
      direction,
      axleX,
      WHEEL_REST_LENGTH,
      WHEEL_RADIUS,
    );
    this.vehicle.addWheel(
      { x: -hx + 0.1, y: connectionY, z: hz - 0.1 },
      direction,
      axleX,
      WHEEL_REST_LENGTH,
      WHEEL_RADIUS,
    );
    this.vehicle.addWheel(
      { x: hx - 0.1, y: connectionY, z: -hz + 0.1 },
      direction,
      axleX,
      WHEEL_REST_LENGTH,
      WHEEL_RADIUS,
    );
    this.vehicle.addWheel(
      { x: -hx + 0.1, y: connectionY, z: -hz + 0.1 },
      direction,
      axleX,
      WHEEL_REST_LENGTH,
      WHEEL_RADIUS,
    );

    for (let i = 0; i < 4; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, SUSPENSION_STIFFNESS);
      this.vehicle.setWheelSuspensionCompression(i, SUSPENSION_DAMPING_COMPRESSION);
      this.vehicle.setWheelSuspensionRelaxation(i, SUSPENSION_DAMPING_RELAXATION);
      this.vehicle.setWheelMaxSuspensionTravel(i, 0.3);
      this.vehicle.setWheelFrictionSlip(i, 1.5);
      this.vehicle.setWheelSideFrictionStiffness(i, 1);
    }
  }

  addGround() {
    const groundDesc = RAPIER.ColliderDesc.cuboid(50, 0.1, 50).setTranslation(0, -0.1, 0);
    this.world.createCollider(groundDesc);
  }

  applyInput(throttle: number, brake: number, steer: number) {
    // Negate so positive throttle drives away from camera (+Z); Rapier's forward is -Z with identity chassis.
    const engine = -(throttle * MAX_ENGINE_FORCE - brake * MAX_BRAKE);
    // Negate steer so left/right match the rotated visual (kart faces +Z with -90° Y offset).
    const steerAngle = -steer * MAX_STEER_RAD;
    // Rear-wheel drive (wheels 2, 3); front wheels (0, 1) steer.
    this.vehicle.setWheelEngineForce(0, 0);
    this.vehicle.setWheelEngineForce(1, 0);
    this.vehicle.setWheelEngineForce(2, engine);
    this.vehicle.setWheelEngineForce(3, engine);
    this.vehicle.setWheelSteering(0, steerAngle);
    this.vehicle.setWheelSteering(1, steerAngle);
    this.vehicle.setWheelBrake(0, brake * MAX_BRAKE);
    this.vehicle.setWheelBrake(1, brake * MAX_BRAKE);
    this.vehicle.setWheelBrake(2, brake * MAX_BRAKE);
    this.vehicle.setWheelBrake(3, brake * MAX_BRAKE);
  }

  update(dt: number) {
    this.vehicle.updateVehicle(dt);
  }

  getChassisBody(): RAPIER.RigidBody {
    return this.chassisBody;
  }

  getWorld(): RAPIER.World {
    return this.world;
  }

  /** Sync a Three.js object to the chassis position and rotation. */
  syncToObject3D(obj: THREE.Object3D) {
    const t = this.chassisBody.translation();
    const r = this.chassisBody.rotation();
    obj.position.set(t.x, t.y, t.z);
    obj.quaternion.set(r.x, r.y, r.z, r.w);
  }
}

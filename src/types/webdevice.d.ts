/**
 * Minimal ambient types for WebUSB and Web Bluetooth.
 *
 * Neither API is in TypeScript's `lib.dom`, and the official `@types/w3c-web-usb`
 * / `@types/web-bluetooth` packages would be two more dependencies for a kiosk
 * that has to build offline. Only the surface `src/lib/printer.ts` actually
 * touches is declared here.
 *
 * No imports or exports in this file — it must stay a global script so the
 * `Navigator` interface merges with the built-in one.
 */

// ── WebUSB ───────────────────────────────────────────────────────────────────

interface USBEndpoint {
  readonly endpointNumber: number;
  readonly direction: "in" | "out";
  readonly type: "bulk" | "interrupt" | "isochronous";
  readonly packetSize: number;
}

interface USBAlternateInterface {
  readonly alternateSetting: number;
  readonly interfaceClass: number;
  readonly interfaceSubclass: number;
  readonly interfaceProtocol: number;
  readonly endpoints: USBEndpoint[];
}

interface USBInterface {
  readonly interfaceNumber: number;
  readonly alternate: USBAlternateInterface;
  readonly alternates: USBAlternateInterface[];
  readonly claimed: boolean;
}

interface USBConfiguration {
  readonly configurationValue: number;
  readonly interfaces: USBInterface[];
}

interface USBOutTransferResult {
  readonly bytesWritten: number;
  readonly status: "ok" | "stall" | "babble";
}

interface USBInTransferResult {
  readonly data?: DataView;
  readonly status: "ok" | "stall" | "babble";
}

interface USBDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName?: string;
  readonly manufacturerName?: string;
  readonly serialNumber?: string;
  readonly opened: boolean;
  readonly configuration: USBConfiguration | null;
  readonly configurations: USBConfiguration[];
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  releaseInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(
    interfaceNumber: number,
    alternateSetting: number,
  ): Promise<void>;
  transferOut(
    endpointNumber: number,
    data: ArrayBufferView | ArrayBuffer,
  ): Promise<USBOutTransferResult>;
  transferIn(
    endpointNumber: number,
    length: number,
  ): Promise<USBInTransferResult>;
}

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
  serialNumber?: string;
}

interface USB {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: USBDeviceFilter[] }): Promise<USBDevice>;
}

// ── Web Bluetooth ────────────────────────────────────────────────────────────

interface BluetoothCharacteristicProperties {
  readonly write: boolean;
  readonly writeWithoutResponse: boolean;
  readonly read: boolean;
  readonly notify: boolean;
}

interface BluetoothRemoteGATTCharacteristic {
  readonly uuid: string;
  readonly properties: BluetoothCharacteristicProperties;
  writeValue(value: ArrayBufferView | ArrayBuffer): Promise<void>;
  /** Newer name for `writeValue`; not in every Chrome build. */
  writeValueWithResponse?(value: ArrayBufferView | ArrayBuffer): Promise<void>;
  /** Much faster, but no per-packet acknowledgement. Optional. */
  writeValueWithoutResponse?(value: ArrayBufferView | ArrayBuffer): Promise<void>;
}

interface BluetoothRemoteGATTService {
  readonly uuid: string;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryServices(
    service?: string,
  ): Promise<BluetoothRemoteGATTService[]>;
}

interface BluetoothDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
  forget?(): Promise<void>;
}

interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: {
    acceptAllDevices?: boolean;
    filters?: { services?: string[]; namePrefix?: string }[];
    optionalServices?: string[];
  }): Promise<BluetoothDevice>;
  /**
   * Previously-granted devices, so a kiosk can reconnect without a chooser.
   * Optional because it is gated behind a flag in some Chrome versions — the
   * printer layer feature-detects it rather than assuming.
   */
  getDevices?(): Promise<BluetoothDevice[]>;
}

interface Navigator {
  readonly usb?: USB;
  readonly bluetooth?: Bluetooth;
}

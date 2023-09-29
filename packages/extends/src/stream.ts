import { EventEmitter as nodeEventEmitter } from "node:events";
import stream from "node:stream";
export { finished, pipeline } from "node:stream/promises";
export { stream as nodeStream };

export type EventMap = Record<string, (...args: any[]) => void>;
export type defineEvents<T extends EventMap> = T;
type EventKey<T extends EventMap> = string & keyof T;

export interface EventEmitter<T extends EventMap = {}> extends nodeEventEmitter {
  emit<K extends EventKey<T>>(eventName: K, ...args: Parameters<T[K]>): boolean;
  emit(name: "error", err: Error): boolean;
  on<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  on(eventName: "error", fn: (err: Error) => void): this;
  prependListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependListener(eventName: "error", fn: (err: Error) => void): this;
  once<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  once(eventName: "error", fn: (err: Error) => void): this;
  prependOnceListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependOnceListener(eventName: "error", fn: (err: Error) => void): this;

  removeListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  removeListener(eventName: "error", fn: (err: Error) => void): this;

  off<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  off(eventName: "error", fn: (err: Error) => void): this;

  removeAllListeners<K extends EventKey<T>>(eventName: K): this;
  removeAllListeners(eventName: "error"): this;
  removeAllListeners(): this;

  rawListeners<K extends EventKey<T>>(eventName: K): (T[K])[];
  rawListeners(eventName: "error"): ((err: Error) => void)[];

  eventNames(): (EventKey<T> | "error")[];
}

export class EventEmitter extends nodeEventEmitter {};

export interface Readable<T extends EventMap = {}> extends stream.Readable {
  addListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  addListener(event: "close", listener: () => void): this;
  addListener(event: "data", listener: (chunk: any) => void): this;
  addListener(event: "end", listener: () => void): this;
  addListener(event: "error", listener: (err: Error) => void): this;
  addListener(event: "pause", listener: () => void): this;
  addListener(event: "readable", listener: () => void): this;
  addListener(event: "resume", listener: () => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<K extends EventKey<T>>(eventName: K, ...args: Parameters<T[K]>): boolean;
  emit(event: "close"): boolean;
  emit(event: "data", chunk: any): boolean;
  emit(event: "end"): boolean;
  emit(event: "error", err: Error): boolean;
  emit(event: "pause"): boolean;
  emit(event: "readable"): boolean;
  emit(event: "resume"): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;

  on<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  on(event: "close", listener: () => void): this;
  on(event: "data", listener: (chunk: any) => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "pause", listener: () => void): this;
  on(event: "readable", listener: () => void): this;
  on(event: "resume", listener: () => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  once(event: "close", listener: () => void): this;
  once(event: "data", listener: (chunk: any) => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "pause", listener: () => void): this;
  once(event: "readable", listener: () => void): this;
  once(event: "resume", listener: () => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  prependListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependListener(event: "close", listener: () => void): this;
  prependListener(event: "data", listener: (chunk: any) => void): this;
  prependListener(event: "end", listener: () => void): this;
  prependListener(event: "error", listener: (err: Error) => void): this;
  prependListener(event: "pause", listener: () => void): this;
  prependListener(event: "readable", listener: () => void): this;
  prependListener(event: "resume", listener: () => void): this;
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this;

  prependOnceListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependOnceListener(event: "close", listener: () => void): this;
  prependOnceListener(event: "data", listener: (chunk: any) => void): this;
  prependOnceListener(event: "end", listener: () => void): this;
  prependOnceListener(event: "error", listener: (err: Error) => void): this;
  prependOnceListener(event: "pause", listener: () => void): this;
  prependOnceListener(event: "readable", listener: () => void): this;
  prependOnceListener(event: "resume", listener: () => void): this;
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this;

  removeListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  removeListener(event: "close", listener: () => void): this;
  removeListener(event: "data", listener: (chunk: any) => void): this;
  removeListener(event: "end", listener: () => void): this;
  removeListener(event: "error", listener: (err: Error) => void): this;
  removeListener(event: "pause", listener: () => void): this;
  removeListener(event: "readable", listener: () => void): this;
  removeListener(event: "resume", listener: () => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
}

export class Readable extends stream.Readable {}

export interface Writable<T extends EventMap = {}> extends stream.Writable {
  addListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  addListener(event: "close", listener: () => void): this;
  addListener(event: "drain", listener: () => void): this;
  addListener(event: "error", listener: (err: Error) => void): this;
  addListener(event: "finish", listener: () => void): this;
  addListener(event: "pipe", listener: (src: Readable) => void): this;
  addListener(event: "unpipe", listener: (src: Readable) => void): this;
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;

  emit<K extends EventKey<T>>(eventName: K, ...args: Parameters<T[K]>): boolean;
  emit(event: "close"): boolean;
  emit(event: "drain"): boolean;
  emit(event: "error", err: Error): boolean;
  emit(event: "finish"): boolean;
  emit(event: "pipe", src: Readable): boolean;
  emit(event: "unpipe", src: Readable): boolean;
  emit(event: string | symbol, ...args: any[]): boolean;

  on<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  on(event: "close", listener: () => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: Readable) => void): this;
  on(event: "unpipe", listener: (src: Readable) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  once(event: "close", listener: () => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: Readable) => void): this;
  once(event: "unpipe", listener: (src: Readable) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;

  prependListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependListener(event: "close", listener: () => void): this;
  prependListener(event: "drain", listener: () => void): this;
  prependListener(event: "error", listener: (err: Error) => void): this;
  prependListener(event: "finish", listener: () => void): this;
  prependListener(event: "pipe", listener: (src: Readable) => void): this;
  prependListener(event: "unpipe", listener: (src: Readable) => void): this;
  prependListener(event: string | symbol, listener: (...args: any[]) => void): this;

  prependOnceListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  prependOnceListener(event: "close", listener: () => void): this;
  prependOnceListener(event: "drain", listener: () => void): this;
  prependOnceListener(event: "error", listener: (err: Error) => void): this;
  prependOnceListener(event: "finish", listener: () => void): this;
  prependOnceListener(event: "pipe", listener: (src: Readable) => void): this;
  prependOnceListener(event: "unpipe", listener: (src: Readable) => void): this;
  prependOnceListener(event: string | symbol, listener: (...args: any[]) => void): this;

  removeListener<K extends EventKey<T>>(eventName: K, fn: T[K]): this;
  removeListener(event: "close", listener: () => void): this;
  removeListener(event: "drain", listener: () => void): this;
  removeListener(event: "error", listener: (err: Error) => void): this;
  removeListener(event: "finish", listener: () => void): this;
  removeListener(event: "pipe", listener: (src: Readable) => void): this;
  removeListener(event: "unpipe", listener: (src: Readable) => void): this;
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
}
export class Writable extends stream.Writable {}

export default {
  Readable,
  Writable,
  EventEmitter
};
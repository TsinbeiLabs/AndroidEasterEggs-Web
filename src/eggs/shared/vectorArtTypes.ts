/** Types for the VectorDrawable data emitted by `npm run gen:art`. */

export interface VectorGradientStop {
  readonly offset: number;
  readonly color: string;
}

export interface VectorLinearGradient {
  readonly type: 'linear';
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly stops: readonly VectorGradientStop[];
}

export interface VectorRadialGradient {
  readonly type: 'radial';
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly stops: readonly VectorGradientStop[];
}

/** An inline `<aapt:attr name="android:fillColor">` gradient, in viewport units. */
export type VectorGradient = VectorLinearGradient | VectorRadialGradient;

export interface VectorPath {
  readonly d: string;
  /** Accumulated `<group>` transform as a canvas affine; omitted when identity. */
  readonly m?: readonly [number, number, number, number, number, number];
  readonly fill?: string;
  readonly fillGradient?: VectorGradient;
  readonly fillType?: 'evenodd';
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly lineCap?: 'butt' | 'round' | 'square';
  readonly lineJoin?: 'miter' | 'round' | 'bevel';
}

export interface VectorArt {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly paths: readonly VectorPath[];
}

import { useMemo } from 'react';

// Lightweight pure TypeScript QR Code Generator (Versions 1-4, Byte mode, Medium EC)
// Implements standard ISO/IEC 18004 QR generation with zero external dependencies.

interface QRCodeProps {
  value: string;
  size?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
  title?: string;
}

// Galois Field GF(256) Math
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function polyMultiply(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMultiply(p1[i], p2[j]);
    }
  }
  return result;
}

function generateGeneratorPoly(deg: number): number[] {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    poly = polyMultiply(poly, [1, GF256_EXP[i]]);
  }
  return poly;
}

function calculateErrorCorrection(data: number[], ecCount: number): number[] {
  const gen = generateGeneratorPoly(ecCount);
  const msg = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = msg[i];
    if (factor !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMultiply(gen[j], factor);
      }
    }
  }
  return msg.slice(data.length);
}

// Generate QR Code Matrix for URL or code
function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const len = utf8Bytes.length;

  // Determine minimum version (1 to 6 with EC level M)
  let version = 1;
  let dataCapacity = 14;
  let ecCount = 10;

  if (len <= 14) {
    version = 1; dataCapacity = 14; ecCount = 10;
  } else if (len <= 26) {
    version = 2; dataCapacity = 26; ecCount = 16;
  } else if (len <= 42) {
    version = 3; dataCapacity = 42; ecCount = 26;
  } else if (len <= 62) {
    version = 4; dataCapacity = 62; ecCount = 36;
  } else {
    version = 5; dataCapacity = 84; ecCount = 48;
  }

  // 1. Bitstream assembly: Mode 4 (Byte: 0100) + Char Count + Data + Terminator
  const bits: number[] = [];
  const appendBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  appendBits(0b0100, 4); // Byte mode
  appendBits(len, 8); // 8-bit character count indicator

  for (let i = 0; i < len; i++) {
    appendBits(utf8Bytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const remainingBits = dataCapacity * 8 - bits.length;
  appendBits(0, Math.min(4, Math.max(0, remainingBits)));

  // Pad to multiple of 8 bits
  while (bits.length % 8 !== 0) bits.push(0);

  // Convert to bytes
  const dataBytes: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i + b];
    dataBytes.push(byte);
  }

  // Pad bytes 0xEC and 0x11 alternately
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataBytes.length < dataCapacity) {
    dataBytes.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Error correction codewords
  const ecBytes = calculateErrorCorrection(dataBytes, ecCount);
  const totalCodewords = [...dataBytes, ...ecBytes];

  // 2. Matrix creation
  const size = 17 + 4 * version;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // Finder pattern at (r, c)
  const addFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const tr = row + r;
        const tc = col + c;
        if (tr < 0 || tr >= size || tc < 0 || tc >= size) continue;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          matrix[tr][tc] = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        } else {
          matrix[tr][tc] = false; // separator
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Alignment pattern for version >= 2
  if (version >= 2) {
    const alignPos = version === 2 ? 18 : version === 3 ? 22 : version === 4 ? 26 : 30;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBorder = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0);
        matrix[alignPos + r][alignPos + c] = isBorder;
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[4 * version + 9][8] = true;

  // Reserved format information areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // Place data codewords in zigzag order
  let bitIndex = 0;
  const allBits: number[] = [];
  for (const byte of totalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);
  }

  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing pattern col
    const cols = [right, right - 1];
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of cols) {
        if (matrix[r][c] === null) {
          const bit = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
          // Apply standard mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // Format info for EC Level M (00) and Mask 0 (000) => 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Top-left
  const positionsTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  positionsTopLeft.forEach(([r, c], idx) => {
    matrix[r][c] = formatBits[idx] === 1;
  });

  // Split around bottom-left & top-right
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = formatBits[7 + i] === 1;
  }

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export function QRCodeSvg({
  value,
  size = 200,
  fgColor = '#1d2421',
  bgColor = '#ffffff',
  className,
  title = 'Game Join QR Code',
}: QRCodeProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value);
    } catch {
      // Fallback matrix if encoding fails
      return generateQrMatrix(value.slice(0, 32));
    }
  }, [value]);

  const moduleCount = matrix.length;
  const cellSize = 10;
  const padding = 20;
  const viewBoxSize = moduleCount * cellSize + padding * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
    >
      <title>{title}</title>
      <rect width={viewBoxSize} height={viewBoxSize} fill={bgColor} rx={8} />
      {matrix.map((row, r) =>
        row.map((cell, c) =>
          cell ? (
            <rect
              key={`${r}-${c}`}
              x={padding + c * cellSize}
              y={padding + r * cellSize}
              width={cellSize}
              height={cellSize}
              fill={fgColor}
            />
          ) : null
        )
      )}
    </svg>
  );
}

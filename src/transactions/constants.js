const ec = (await import("elliptic")).default;

const ENDIAN = "le";
const CURVE = "p256";
const SMALLEST = 100000000;
const MAX_SUPPLY = 18884643;
const VERSION = 1;
const MAX_BLOCK_SIZE_HEX = 4096 * 1024;
const MAX_INODES = 12;

export {
  ENDIAN,
  CURVE,
  SMALLEST,
  MAX_SUPPLY,
  VERSION,
  MAX_BLOCK_SIZE_HEX,
  MAX_INODES,
};

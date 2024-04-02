const bs58 = (await import("bs58")).default;
const crypto = (await import("crypto")).default;
const ec = (await import("elliptic")).default;
const Decimal = (await import("decimal.js")).Decimal;

const ENDIAN = "le";
const CURVE_NAME = "p256";

const AddressFormat = {
  FULL_HEX: "hex",
  COMPRESSED: "compressed",
};

const TransactionType = {
  REGULAR: 0,
  STAKE: 1,
  UN_STAKE: 2,
  INODE_REGISTRATION: 3,
  INODE_DE_REGISTRATION: 4,
  VALIDATOR_REGISTRATION: 5,
  VOTE_AS_VALIDATOR: 6,
  VOTE_AS_DELEGATE: 7,
  REVOKE_AS_VALIDATOR: 8,
  REVOKE_AS_DELEGATE: 9,
};

const OutputType = {
  REGULAR: 0,
  STAKE: 1,
  UN_STAKE: 2,
  INODE_REGISTRATION: 3,
  VALIDATOR_REGISTRATION: 5,
  VOTE_AS_VALIDATOR: 6,
  VOTE_AS_DELEGATE: 7,
  VALIDATOR_VOTING_POWER: 8,
  DELEGATE_VOTING_POWER: 9,
};

const InputType = {
  REGULAR: 0,
  FEES: 1,
};

function timestamp() {
  return Math.floor(Date.now() / 1000);
}

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

function byteLength(i) {
  return Math.ceil(i.toString(2).length / 8.0);
}

function normalizeBlock(block) {
  let normalizedBlock = Object.assign({}, block);

  normalizedBlock.address = normalizedBlock.address.trim();
  normalizedBlock.timestamp = Math.floor(
    new Date(normalizedBlock.timestamp).getTime() / 1000
  );

  return normalizedBlock;
}

function bigintToBytes(num, length, endian) {
  if (length < 1 || length > 32) {
    throw new Error("Length must be between 1 and 32");
  }

  const result = new Uint8Array(length);

  if (endian === "le") {
    for (let i = 0; i < length; i++) {
      result[i] = Number(num & 0xffn);
      num >>= 8n;
    }
  } else if (endian === "big") {
    for (let i = length - 1; i >= 0; i--) {
      result[i] = Number(num & 0xffn);
      num >>= 8n;
    }
  } else {
    throw new Error('Invalid endian. Use "little" or "big".');
  }

  if (num !== 0n) {
    throw new Error("Integer too large to convert to bytes");
  }

  return result;
}

function pointToBytes(point, addressFormat = AddressFormat.FULL_HEX) {
  if (addressFormat === AddressFormat.FULL_HEX) {
    return Buffer.concat([
      Buffer.from(point.getX().toArray(ENDIAN, 32)),
      Buffer.from(point.getY().toArray(ENDIAN, 32)),
    ]);
  } else if (addressFormat === AddressFormat.COMPRESSED) {
    return stringToBytes(pointToString(point, AddressFormat.COMPRESSED));
  } else {
    throw new Error("Not Implemented");
  }
}

function pointToString(point, addressFormat = AddressFormat.COMPRESSED) {
  switch (addressFormat) {
    case AddressFormat.FULL_HEX:
      const pointBytes = pointToBytes(point);
      return pointBytes.toString("hex");

    case AddressFormat.COMPRESSED:
      const x = BigInt(point.getX().toString(10, 64));
      console.log("Before x : ", x);
      const y = BigInt(point.getY().toString(10, 64));
      console.log("Before y : ", y);
      const specifier = y % 2n === 0n ? 42 : 43;

      const address = bs58.encode(
        Buffer.concat([
          Buffer.from([specifier]),
          Buffer.from(bigintToBytes(x, 32, ENDIAN)),
        ])
      );

      return address;

    default:
      throw new Error("Not Implemented");
  }
}

function bytesToPoint(pointBytes) {
  if (pointBytes.length === 64) {
    const x = BigInt(`0x${pointBytes.slice(0, 32).toString("hex")}`);
    const y = BigInt(`0x${pointBytes.slice(32, 64).toString("hex")}`);
    return ec.curve.pointFromXY(x, y);
  } else if (pointBytes.length === 33) {
    const specifier = pointBytes[0];
    const xBytes = pointBytes.slice(1);
    const x = BigInt(`0x${xBytes.toString("hex")}`);
    const isOdd = specifier === 43;
    const y = yFromX(x, isOdd);
    return ec.curve.pointFromXY(x, y);
  } else {
    throw new Error("Not Implemented");
  }
}

function bytesToBigInt(bytes, endian) {
  let result = 0n;
  if (endian === "le") {
    for (let i = bytes.length - 1; i >= 0; i--) {
      result <<= 8n;
      result += BigInt(bytes[i]);
    }
  } else if (endian === "big") {
    for (let i = 0; i < bytes.length; i++) {
      result <<= 8n;
      result += BigInt(bytes[i]);
    }
  } else {
    throw new Error('Invalid endian. Use "little" or "big".');
  }
  return result;
}

function legendreSymbol(a, p) {
  let ls = modPow(a, (p - BigInt(1)) / BigInt(2), p);
  return ls === BigInt(1)
    ? BigInt(1)
    : ls === p - BigInt(1)
    ? BigInt(-1)
    : BigInt(0);
}

function modPow(base, exponent, modulus) {
  if (modulus === BigInt(1)) return BigInt(0);
  let result = BigInt(1);
  base = base % modulus;
  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) result = (result * base) % modulus;
    exponent = exponent / BigInt(2);
    base = (base * base) % modulus;
  }
  return result;
}

function tonelliShanks(a, p) {
  if (legendreSymbol(a, p) !== BigInt(1)) {
    return [NaN, NaN];
  }

  let q = p - BigInt(1);
  let s = BigInt(0);
  while (q % BigInt(2) === BigInt(0)) {
    q /= BigInt(2);
    s += BigInt(1);
  }

  if (s === BigInt(1)) {
    return [
      modPow(a, (p + BigInt(1)) / BigInt(4), p),
      p - modPow(a, (p + BigInt(1)) / BigInt(4), p),
    ];
  }

  let z = BigInt(2);
  while (legendreSymbol(z, p) !== p - BigInt(1)) {
    z++;
  }

  let c = modPow(z, q, p);
  let r = modPow(a, (q + BigInt(1)) / BigInt(2), p);
  let t = modPow(a, q, p);
  let m = s;

  while (true) {
    if (t === BigInt(1)) {
      return [r, p - r];
    }

    let i = BigInt(1);
    let temp = t;
    while (temp !== BigInt(1) && i < m) {
      temp = modPow(t, BigInt(2) ** i, p);
      i++;
    }

    let b = modPow(c, BigInt(2) ** (m - i - BigInt(1)), p);
    r = (r * b) % p;
    t = (t * b * b) % p;
    c = (b * b) % p;
    m = i;
  }
}

function yFromX(x, is_odd) {
  const a = -3n;
  const b =
    41058363725152142129326129780047268409114441015993725554835256314039467401291n;
  const p =
    115792089210356248762697446949407573530086143415290314195533631308867097853951n;
  // const a = BigInt(ecInstance.curve.a);
  // const b = BigInt(ecInstance.curve.b);
  // const p = BigInt(ecInstance.curve.p);
  // console.log(a, b, p);
  x = BigInt(x);

  // Compute y^2 = x^3 + ax + b
  let y2 = x ** 3n + a * x + b;

  const [y_res, y_mod] = tonelliShanks(y2, p);
  // console.log(y_res, y_mod);
  if (y_res % 2n == is_odd) return y_res;
  else return y_mod;
}

function stringToPoint(string) {
  const pointBytes = bs58.decode(string);

  let xBytes, yBytes;
  switch (pointBytes.length) {
    case 33:
      // If the length is 33, it's a compressed point, so we need to decompress it
      const specifier = pointBytes[0];
      xBytes = bytesToBigInt(pointBytes.subarray(1), ENDIAN);
      console.log("After x : ", xBytes);
      const isOdd = specifier === 0x03 || specifier === 0x02;
      yBytes = yFromX(xBytes, isOdd);
      console.log("After y : ", yBytes);
      break;
    case 64:
      // If the length is 64, it's a full point
      xBytes = pointBytes.subarray(0, 32);
      yBytes = pointBytes.subarray(32);
      break;
    default:
      throw new Error("Invalid point bytes length");
  }

  return [xBytes, yBytes];
}

function stringToBytes(string) {
  let bytes;

  bytes = Buffer.from(string, "hex");

  if (bytes.length === 0 || bytes.length === 1) {
    try {
      bytes = bs58.decode(string);
    } catch (error) {
      throw new Error("Failed to convert string to bytes: " + error.message);
    }
  }
  return bytes;
}

function bytesToString(pointBytes) {
  const point = bytesToPoint(pointBytes);
  let addressFormat;
  if (pointBytes.length === 64) {
    addressFormat = AddressFormat.FULL_HEX;
  } else if (pointBytes.length === 33) {
    addressFormat = AddressFormat.COMPRESSED;
  } else {
    throw new Error("Not Implemented");
  }
  return pointToString(point, addressFormat);
}

const transactionTypeMapping = Object.entries(TransactionType).reduce(
  (acc, [key, value]) => {
    acc[value] = key;
    return acc;
  },
  {}
);

function getTransactionTypeFromMessage(message) {
  let transactionType = TransactionType.REGULAR;

  try {
    // Convert Buffer to string
    const strMessage = simpleBytesToString(message);

    // Convert strMessage back to enum
    const decodedMessage = parseInt(strMessage, 10);
    transactionType =
      transactionTypeMapping[decodedMessage] || TransactionType.REGULAR;
  } catch (error) {
    // Handle potential decoding errors or value errors
    console.error(error);
    transactionType = TransactionType.REGULAR;
  }

  return transactionType;
}

function simpleBytesToString(data) {
  if (!data) {
    return null;
  }
  try {
    // Attempt to decode bytes as UTF-8
    return data.toString("utf-8");
  } catch (error) {
    // If decoding as UTF-8 fails, return it as a hex string
    return data.toString("hex");
  }
}

function roundUpDecimal(decimalValue, roundUpLength = "0.00000001") {
  let decimal = new Decimal(decimalValue);
  const roundUpLengthDecimal = new Decimal(roundUpLength);

  if (!decimal.mod(roundUpLengthDecimal).equals(0)) {
    const times = decimal.dividedBy(roundUpLengthDecimal).ceil();

    decimal = times.times(roundUpLengthDecimal);
  }

  return decimal;
}

export {
  OutputType,
  InputType,
  TransactionType,
  timestamp,
  sha256,
  byteLength,
  pointToBytes,
  normalizeBlock,
  stringToBytes,
  stringToPoint,
  pointToString,
  bytesToString,
  bytesToPoint,
  getTransactionTypeFromMessage,
  roundUpDecimal,
};

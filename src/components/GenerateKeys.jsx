import React, { useState } from "react";
import { generateKeys } from "./keys";

function GenerateKeys() {
  const [keys, setKeys] = useState({
    privateKey: "",
    publicKey: "",
    address: "",
    BigInt: "",
  });

  const handleGenerateKeys = () => {
    const generatedKeys = generateKeys();
    setKeys(generatedKeys);
  };

  console.log("keys", keys);

  return (
    <div>
      <button onClick={handleGenerateKeys}>Generate Keys</button>
      <div>
        <p>Private Key: {keys.privateKey}</p>
        <p>PrivateBigInt: {keys.BigInt.toString()}</p>
        <p>Public Key: {keys.publicKey}</p>
        <p>Address: {keys.address}</p>
      </div>
    </div>
  );
}

export default GenerateKeys;

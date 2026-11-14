// Zip bombası savunması: xlsx (zip) merkezi dizinindeki toplam açılmış boyutu, dosyayı açmadan okur.

/** Toplam açılmış boyut (bayt); geçerli bir zip değilse null. Zip64 işaretleyicisi sonsuz sayılır. */
export function zipUncompressedSize(buf: Buffer): number | null {
  const minEocd = 22;
  if (buf.length < minEocd) return null;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || offset === 0xffffffff) return Infinity;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) return null;
    const size = buf.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return Infinity;
    total += size;
    offset += 46 + buf.readUInt16LE(offset + 28) + buf.readUInt16LE(offset + 30) + buf.readUInt16LE(offset + 32);
  }
  return total;
}

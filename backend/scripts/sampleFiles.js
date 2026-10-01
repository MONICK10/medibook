// scripts/sampleFiles.js
// -----------------------------------------------------------------
// Builds small, genuinely valid PDF and PNG files in memory, for the
// seed script to upload as sample medical reports.
//
// WHY generate them instead of committing a few files:
// a repo with binary fixtures in it is a repo where nobody is sure
// what those bytes are. Generating them keeps the repository text-only
// and means the samples are obviously fake. They also have to be
// really valid, not just named ".pdf", or the download feature would
// appear broken when a student opens one.
//
// All content is invented. There is no real patient data anywhere.
// -----------------------------------------------------------------

const zlib = require('zlib');

// =================================================================
// PDF
// =================================================================
// A PDF is a set of numbered objects, followed by a cross-reference
// table listing the exact BYTE OFFSET of each one. That is why this is
// built up as a list of buffers while counting bytes - get an offset
// wrong and strict readers reject the file.

function makePdf({ title, lines }) {
  const escape = (text) =>
    // These three characters are PDF syntax and must be escaped inside
    // a text string, or the file is corrupt.
    String(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

  // The page content: move down the page writing one line at a time.
  let content = 'BT\n/F1 18 Tf\n72 780 Td\n(' + escape(title) + ') Tj\nET\n';
  let y = 740;
  for (const line of lines) {
    content += `BT\n/F1 11 Tf\n72 ${y} Td\n(${escape(line)}) Tj\nET\n`;
    y -= 18;
  }

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
  ];

  const parts = [];
  let offset = 0;
  const offsets = [];

  const push = (text) => {
    const buffer = Buffer.from(text, 'latin1');
    parts.push(buffer);
    offset += buffer.length;
  };

  push('%PDF-1.4\n');
  // A comment with high bytes, which tells tools the file is binary.
  push('%\xE2\xE3\xCF\xD3\n');

  objects.forEach((body, index) => {
    offsets.push(offset); // remember where this object starts
    push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = offset;
  // Every xref line is exactly 20 bytes, including the trailing space
  // and newline. The spec is strict about this.
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const position of offsets) {
    xref += `${String(position).padStart(10, '0')} 00000 n \n`;
  }
  push(xref);

  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
      `startxref\n${xrefOffset}\n%%EOF\n`
  );

  return Buffer.concat(parts);
}

// =================================================================
// PNG
// =================================================================
// A PNG is a signature followed by "chunks", each one length + type +
// data + CRC32. Built here rather than pasted as base64 so you can see
// what the bytes are.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([length, typeAndData, crc]);
}

// A plain image with a few coloured horizontal bands, so it is clearly
// a picture and not a broken file when a student opens it.
function makePng({ width = 320, height = 200 } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // standard filtering
  ihdr[12] = 0; // no interlacing

  // Each row is prefixed with a filter byte (0 = none).
  const raw = Buffer.alloc(height * (1 + width * 3));
  let position = 0;

  for (let y = 0; y < height; y += 1) {
    raw[position] = 0;
    position += 1;

    const band = Math.floor((y / height) * 4);
    const colour = [
      [11, 110, 121], // teal
      [240, 246, 249], // near white
      [11, 110, 121],
      [240, 246, 249],
    ][band] || [240, 246, 249];

    for (let x = 0; x < width; x += 1) {
      raw[position] = colour[0];
      raw[position + 1] = colour[1];
      raw[position + 2] = colour[2];
      position += 3;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makePdf, makePng };

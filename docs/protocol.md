# Extracted EM06 mouse protocol

Source: the public Hub bundle at `https://hub.protoarc.com/assets/index-B-NBYECN.js`.

## HID framing

- WebHID report ID: `8`
- Payload length: 16 bytes
- Command byte: byte `0`
- Flash address: bytes `2..3`, big-endian
- Payload length: byte `4` (mouse path has no extra type offset)
- Payload: bytes `5..`
- Frame checksum: `(0x55 - sum(bytes 0..14) - 8) & 0xff` in byte `15`

The source initializes byte 15 to `0xef`, but overwrites it with the adjusted
checksum before every send. The `0xef` value is not transmitted.

## Commands

| Command | Meaning |
|---:|---|
| `0x01` | Device identification / encryption data |
| `0x03` | Device online |
| `0x07` | Write flash |
| `0x08` | Read flash |
| `0x0e` | Get current profile |
| `0x0f` | Set current profile |

## Mouse flash layout

- Key records: offset `96`, four bytes per slot. The EM06 Hub uses sparse physical
  slots `0, 1, 2, 4, 3, 5, 11, 8` for its eight displayed controls; slot `5`
  is the side DPI control, slot `8` is the top-right Drag Scroll control, and
  slot `11` is the center-lower control.
- Shortcut records: offset `256`, 32 bytes per slot; the shortcut slot is the
  same sparse physical slot as its key record
- Macro records: offset `768`, 384 bytes per slot
- EEPROM end: `6987`

Key record encoding is `[type, parameter >> 8, parameter & 255, checksum]`,
where the local checksum is `0x55 - sum(first three bytes)`. The Hub defines
function type `9` as `ProfileSwitch`. The parameter is the target profile, so a
cycle key is written per profile with targets `1`, `2`, `3`, and `0`.
On the EM06, the middle-lower/extra Button 7 is displayed at index 6 and stored at raw slot 11.

The Hub writes flash in chunks of at most 10 bytes and waits for the matching
input report before sending the next chunk. The simulator and WebHID transport
follow that sequencing boundary.

Shortcut records begin with `keyCount * 2`, followed by each HID key as
`[type | 0x80, valueLo, valueHi]`, then the same keys in reverse order with
`type | 0x40`, and a final local checksum. The editor decodes these records,
labels known Hub combinations such as Copy, and can record arbitrary keyboard
combinations. Macro slots are identified from their 31-byte UTF-8 name records;
macro event authoring is intentionally not exposed until the event-table format
has been validated against the Hub implementation.

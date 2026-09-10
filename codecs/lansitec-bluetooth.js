// Contrat GateFlow pour les rapports major/minor et les messages de vie Lansitec.
// RÃ©fÃ©rence : https://www.lansitec.com/fr/docs/decoders/decodeur-lorawan-passerelle-bluetooth-ttn-chirpstack/
function decodeUplink(input) {
  var bytes = input.bytes;
  function failure(reason) {
    return { data: { event_type: 'decode_error', decoder_version: 'gateflow-1', error: reason }, errors: [reason] };
  }
  if (!Array.isArray(bytes) || !bytes.length || bytes.some(function (byte) { return !Number.isInteger(byte) || byte < 0 || byte > 255; })) return failure('Payload invalide');
  var type = bytes[0] >> 4;
  if (type === 2) {
    if (bytes.length !== 8) return failure('Longueur du message de vie non reconnue');
    return { data: {
      event_type: 'relay_heartbeat', decoder_version: 'gateflow-1',
      battery_raw: bytes[1], radio_rssi_raw: bytes[2], radio_snr_raw: bytes[3] * 256 + bytes[4],
      firmware_raw: bytes[5] * 256 + bytes[6], charging_raw: bytes[7],
    } };
  }
  // Le profil matÃ©riel doit confirmer la signification des valeurs techniques brutes.
  if (type === 8 || bytes[0] === 0x71) {
    var count = bytes[0] === 0x71 ? (bytes.length - 1) / 5 : bytes[0] & 15;
    if (!Number.isInteger(count)) return failure('Rapport historique tronqué');
    if (bytes.length !== 1 + count * 5) return failure('Rapport de balises tronquÃ© ou format diffÃ©rent');
    var beacons = [];
    for (var index = 0; index < count; index++) {
      var offset = 1 + index * 5;
      beacons.push({ major: bytes[offset] * 256 + bytes[offset + 1], minor: bytes[offset + 2] * 256 + bytes[offset + 3], rssi: bytes[offset + 4] > 127 ? bytes[offset + 4] - 256 : bytes[offset + 4] });
    }
    return { data: { event_type: 'beacon_report', decoder_version: 'gateflow-1', beacons: beacons } };
  }
  return failure('Type de trame non pris en charge par ce profil');
}

if (typeof module !== 'undefined') module.exports = { decodeUplink };

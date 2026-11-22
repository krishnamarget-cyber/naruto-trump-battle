// roomClientAuto.js — uses Firebase when firebase-config.js is filled in, otherwise falls back to PeerJS.
import { RoomMultiplayerClient as PeerClient } from "./roomClient.js";
import { FirebaseRoomClient } from "./roomClientFirebase.js";

export class RoomMultiplayerClient {
  constructor() {
    return globalThis.NTB_FIREBASE_CONFIG?.databaseURL ? new FirebaseRoomClient() : new PeerClient();
  }
}

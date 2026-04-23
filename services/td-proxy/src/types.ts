export interface BerthEvent {
  td: string;
  fromBerth: string;
  toBerth: string;
  trainId: string;
  /** Unix ms timestamp from the TD message itself */
  timestamp: number;
  /** Human-readable station name */
  station: string;
  /** What the train is doing at this berth */
  event: 'depart-north' | 'depart-south' | 'arrive-north' | 'arrive-south';
  /** Seconds from step firing to the actual physical event (negative = fires before) */
  offsetSeconds: number;
}

/** Raw CA message from the Network Rail TD feed */
export interface RawCAMsg {
  time: string;
  area_id: string;
  msg_type: 'CA';
  from: string;
  to: string;
  descr: string;
}

export interface RawTDMessage {
  CA_MSG?: RawCAMsg;
  CB_MSG?: unknown;
  CC_MSG?: unknown;
  CT_MSG?: unknown;
  SF_MSG?: unknown;
  SG_MSG?: unknown;
  SH_MSG?: unknown;
}

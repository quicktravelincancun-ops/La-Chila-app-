
export interface TransferLeg {
  id: string;
  origin: string;
  destination: string;
  pax: number;
  startTime: string;
  returnTime: string;
  date: string;
}

export interface TourLeg {
  id: string;
  tourName: string;
  tourType: string;
  originDeparture: string;
  peopleCountDeparture: number;
  departureTimeHotel: string;
  dateDeparture: string;
  observations?: string;
}

export interface CircuitoLeg {
  id: string;
  date: string;
  placesToVisit: string;
  schedule: string;
  entranceCosts: string;
  pricePerDay?: string;
  observations?: string;
}

export interface Reservation {
  id: string;
  reservationNo: string;
  name: string; // Titular / Lead Name
  serviceType: string; // Type of service (Arrival, Departure, etc.)
  transferSubtype?: string; // Sencillo, Redondo, Múltiple
  tourType?: string; // Compartido, Privado, Especial
  tourName?: string; // Name of the tour
  observations?: string; // Notes
  dateArrival: string;
  dateDeparture: string;
  origin: string; // Origen Llegada
  destination: string; // Referencia General
  
  // Arrival Info
  arrivalName: string; // Specific name for arrival leg
  arrivalDestination: string; 
  flightNoArrival: string;
  airlineArrival: string;
  arrivalTime: string;
  peopleCountArrival: number; // Specific PAX for arrival
  
  // Departure Info
  departureName: string; // Specific name for departure leg
  departureDestination: string; 
  peopleCountDeparture: number; 
  originDeparture: string; 
  departureTimeHotel: string;
  departureTimeFlight: string;
  
  // Multiple Transfers
  extraLegs?: TransferLeg[];
  
  // Multiple Tours
  extraTours?: TourLeg[];

  // Circuito Info
  circuitoLegs?: CircuitoLeg[];
  unitType?: string; // 1-8, 9-10, 11-15
  includedThings?: string;
  notIncludedThings?: string;

  peopleCount: number; // General PAX
  
  // Balance Fields
  depositMxn: number;
  toPayMxn: number;
  depositUsd: number;
  toPayUsd: number;
  roomNumber?: string;
  
  createdAt: string;
}

export interface ContactInfo {
  label: string;
  number: string;
}

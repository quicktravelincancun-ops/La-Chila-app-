
import React from 'react';
import { ContactInfo } from './types';

export const COLORS = {
  primary: '#0a305e', // Deep Navy (Blue in logo)
  secondary: '#f05a28', // Orange Accent (Orange in logo)
  accent: '#00aae4', // Light Blue
  success: '#34a853', // Google Green
  danger: '#ea4335' // Google Red
};

export const CONTACTS: Record<string, ContactInfo> = {
  DRIVER: { label: 'Chofer', number: '+529981317824' },
  STAFF: { label: 'Personal de Viaje', number: '+529982127348' },
  CUSTOMER: { label: 'Atención a Cliente', number: '+52981056561' }
};

export const TOUR_LIST = [
  "Xcaret básico",
  "Xcaret plus",
  "Xoximilco",
  "Xel-Há",
  "Xplor",
  "Xenses",
  "Chichén Itzá",
  "Tour 4x1",
  "Catamarán isla mujeres",
  "Holbox",
  "Bacalar",
  "Atvs",
  "Cozumel el cielo lancha",
  "Cozumel el cielo catamarán",
  "Ek Balam",
  "Delfines + garrafón + isla mujeres"
];

export const COMPANY_EMAIL = 'quicktravelincancun@gmail.com';
export const SHEET_NAME = 'beta arrivals quick';

export const Logo = ({ className = "", height = "h-14" }: { className?: string, height?: string }) => (
  <div className={`flex items-center ${className}`}>
    <img 
      src="/input_file_3.png" 
      alt="Quick Travel Cancun Logo" 
      className={`${height} w-auto object-contain`}
      referrerPolicy="no-referrer"
    />
  </div>
);

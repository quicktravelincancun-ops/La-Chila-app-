
import { Reservation } from './types';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export const getWhatsAppLink = (number: string, message: string) => {
  const numberClean = number.replace(/\D/g, '');
  return `https://wa.me/${numberClean}?text=${encodeURIComponent(message)}`;
};

export const getGoogleMapsLink = (query: string) => {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

export const generateWhatsAppMessage = (res: Reservation) => {
  const showArrival = res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Llegada";
  const showDeparture = res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Salida";
  const showTransfer = res.serviceType === "Solo Traslado";
  const showTour = res.serviceType === "Tour o Excursión";
  const showCircuito = res.serviceType === "Circuito";

  let msg = `*QUICK TRAVEL CANCUN - VOUCHER OFICIAL*\n`;
  msg += `*Servicio:* ${res.serviceType}${res.transferSubtype ? ` (${res.transferSubtype})` : ''}\n`;
  msg += `----------------------------------\n`;
  msg += `*Reserva:* ${res.reservationNo}\n`;
  msg += `*Titular:* ${res.name}\n\n`;

  if (showArrival) {
    msg += `*LLEGADA:*\n`;
    msg += `📍 Origen: ${res.origin}\n`;
    msg += `🏨 Destino: ${res.arrivalDestination}\n`;
    msg += `📅 Fecha: ${res.dateArrival}\n`;
    msg += `✈️ Vuelo: ${res.flightNoArrival}\n`;
    msg += `🕒 Hora: ${res.arrivalTime}\n`;
    msg += `👤 Pax: ${res.peopleCountArrival}\n\n`;
  }

  if (showDeparture) {
    msg += `*SALIDA:*\n`;
    msg += `📍 Origen: ${res.originDeparture}\n`;
    msg += `🏨 Destino: ${res.departureDestination}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🚐 *Pick-up:* ${res.departureTimeHotel}\n`;
    msg += `✈️ Vuelo: ${res.departureTimeFlight}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;
  }

  if (showTransfer) {
    msg += `*TRASLADO:*\n`;
    msg += `📍 Origen: ${res.originDeparture}\n`;
    msg += `🏨 Destino: ${res.departureDestination}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🕒 *Hora Inicio:* ${res.departureTimeHotel}\n`;
    msg += `🕒 *Hora Regreso:* ${res.departureTimeFlight}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;

    if (res.transferSubtype === "Traslado Múltiple" && res.extraLegs && res.extraLegs.length > 0) {
      msg += `*TRAMOS ADICIONALES:*\n`;
      res.extraLegs.forEach((leg, i) => {
        msg += `[${i+1}] 📍 ${leg.origin} -> 🏨 ${leg.destination}\n`;
        msg += `📅 ${leg.date} | 🕒 ${leg.startTime} - ${leg.returnTime} | 👤 Pax: ${leg.pax}\n\n`;
      });
    }
  }

  if (showTour) {
    msg += `*TOUR / EXCURSIÓN 1:*\n`;
    msg += `🌟 *Tour:* ${res.tourName || '---'}\n`;
    msg += `📋 Tipo: ${res.tourType || '---'}\n`;
    msg += `📍 Hotel/Punto: ${res.originDeparture}\n`;
    msg += `📅 Fecha: ${res.dateDeparture}\n`;
    msg += `🚐 *Pick-up:* ${res.departureTimeHotel}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n\n`;

    if (res.extraTours && res.extraTours.length > 0) {
      res.extraTours.forEach((tour, i) => {
        msg += `*TOUR / EXCURSIÓN ${i + 2}:*\n`;
        msg += `🌟 *Tour:* ${tour.tourName || '---'}\n`;
        msg += `📋 Tipo: ${tour.tourType || '---'}\n`;
        msg += `📍 Hotel/Punto: ${tour.originDeparture}\n`;
        msg += `📅 Fecha: ${tour.dateDeparture}\n`;
        msg += `🚐 *Pick-up:* ${tour.departureTimeHotel}\n`;
        msg += `👤 Pax: ${tour.peopleCountDeparture}\n`;
        if (tour.observations) {
          msg += `📝 Observaciones: ${tour.observations}\n`;
        }
        msg += `\n`;
      });
    }
  }

  if (showCircuito) {
    msg += `*CIRCUITO:*\n`;
    msg += `🚐 Tipo de Unidad: ${res.unitType || '---'}\n`;
    msg += `👤 Pax: ${res.peopleCountDeparture}\n`;
    msg += `📅 Fecha Inicio: ${res.dateDeparture}\n\n`;

    if (res.includedThings) {
      msg += `✅ *Incluye:*\n${res.includedThings}\n\n`;
    }
    if (res.notIncludedThings) {
      msg += `❌ *No Incluye:*\n${res.notIncludedThings}\n\n`;
    }

    if (res.circuitoLegs && res.circuitoLegs.length > 0) {
      msg += `*ITINERARIO:*\n`;
      res.circuitoLegs.forEach((leg, i) => {
        msg += `*Día ${i + 1} - ${leg.date}*\n`;
        msg += `🕒 Horario: ${leg.schedule}\n`;
        if (leg.pricePerDay) {
          msg += `💵 Precio: ${leg.pricePerDay}\n`;
        }
        msg += `📍 Puntos a visitar: ${leg.placesToVisit}\n`;
        msg += `🎟️ Entradas: ${leg.entranceCosts}\n`;
        if (leg.observations) {
          msg += `📝 Observaciones: ${leg.observations}\n`;
        }
        msg += `\n`;
      });
    }
  }

  if (res.observations) {
    msg += `📝 Notas: ${res.observations}\n\n`;
  }

  msg += `*SALDOS MXN:*\n`;
  msg += `💰 Depósito: $${res.depositMxn}\n`;
  msg += `💵 A Pagar: $${res.toPayMxn}\n\n`;

  msg += `*SALDOS USD:*\n`;
  msg += `💰 Deposit: $${res.depositUsd}\n`;
  msg += `💵 To Pay: $${res.toPayUsd}\n\n`;

  msg += `_Propina no incluida. ¡Buen viaje!_`;

  return msg.trim();
};

export interface PDFGenerationResult {
  success: boolean;
  filename: string;
  blobUrl?: string;
  serverUrl?: string;
  downloadUrl?: string;
  googleDocsUrl?: string;
  error?: string;
}

export const openLinkInBlank = (url: string, downloadName?: string) => {
  if (!url) return;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('target', '_blank');
    if (downloadName) {
      a.setAttribute('download', downloadName);
    }
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
    }, 1500);
  } catch (err) {
    console.warn('Error al abrir enlace con target _blank:', err);
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.warn('Fallback window.open bloqueado:', e);
    }
  }
};

export const printVoucher = () => {
  try {
    window.print();
  } catch (err) {
    console.warn('Error al invocar window.print():', err);
  }
};

export const downloadAsPDF = async (
  elementIdOrElement: string | HTMLElement, 
  filename: string,
  options?: {
    openMode?: 'auto' | 'gdocs' | 'blank' | 'none';
  }
): Promise<PDFGenerationResult> => {
  const element = typeof elementIdOrElement === 'string' 
    ? document.getElementById(elementIdOrElement) 
    : elementIdOrElement;

  if (!element) {
    console.error('downloadAsPDF: Elemento no encontrado:', elementIdOrElement);
    return {
      success: false,
      filename,
      error: 'Elemento no encontrado para generar PDF'
    };
  }
  
  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: document.documentElement.offsetWidth,
      onclone: (_clonedDoc, clonedEl) => {
        clonedEl.style.maxHeight = 'none';
        clonedEl.style.overflow = 'visible';
        clonedEl.style.height = 'auto';
        clonedEl.style.transform = 'none';
      }
    });
    
    const imgData = canvas.toDataURL('image/png', 1.0);
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const maxLineWidth = pdfWidth - (margin * 2);
    const maxHeight = pdfHeight - (margin * 2);
    
    const imgProps = pdf.getImageProperties(imgData);
    const ratio = imgProps.width / imgProps.height;
    
    let displayWidth = maxLineWidth;
    let displayHeight = displayWidth / ratio;
    
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * ratio;
    }
    
    const xOffset = (pdfWidth - displayWidth) / 2;
    const yOffset = margin;
    
    pdf.addImage(imgData, 'PNG', xOffset, yOffset, displayWidth, displayHeight);

    const pdfBlob = pdf.output('blob');
    const blobUrl = URL.createObjectURL(pdfBlob);
    const pdfBase64 = pdf.output('datauristring');

    // Subir temporalmente al backend para servir con URL pública a Google Docs Viewer
    let serverUrl = '';
    let downloadUrl = '';
    let googleDocsUrl = '';

    try {
      const uploadRes = await fetch('/api/pdf/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64, filename })
      });

      if (uploadRes.ok) {
        const data = await uploadRes.json();
        if (data.success) {
          serverUrl = data.fullUrl || `${window.location.origin}${data.viewUrl}`;
          downloadUrl = data.downloadUrl ? `${window.location.origin}${data.downloadUrl}` : serverUrl;
          googleDocsUrl = data.googleDocsUrl || `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(serverUrl)}`;
        }
      }
    } catch (uploadErr) {
      console.warn('No se pudo subir PDF temporal al servidor:', uploadErr);
    }

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    // Priorizar Google Docs Viewer si tenemos URL pública disponible, o bien URL directa con target='_blank'
    let targetOpenUrl = blobUrl;
    if (googleDocsUrl && !isLocalhost) {
      targetOpenUrl = googleDocsUrl;
    } else if (serverUrl) {
      targetOpenUrl = serverUrl;
    }

    const openMode = options?.openMode || 'auto';
    if (openMode !== 'none') {
      if (openMode === 'gdocs' && googleDocsUrl) {
        openLinkInBlank(googleDocsUrl);
      } else if (openMode === 'blank') {
        openLinkInBlank(serverUrl || blobUrl, filename);
      } else {
        // En Android y web, forzar apertura segura con target='_blank' usando Google Docs o visor seguro
        openLinkInBlank(targetOpenUrl);
      }
    }

    return {
      success: true,
      filename,
      blobUrl,
      serverUrl,
      downloadUrl,
      googleDocsUrl: googleDocsUrl || (serverUrl ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(serverUrl)}` : undefined),
    };
  } catch (error: any) {
    console.error('Error al generar PDF:', error);
    return {
      success: false,
      filename,
      error: error?.message || 'Error desconocido al generar PDF'
    };
  }
};

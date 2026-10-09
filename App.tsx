
import React, { useState, useEffect } from 'react';
import { Reservation, TransferLeg, TourLeg, CircuitoLeg } from './types';
import { CONTACTS, COMPANY_EMAIL, SHEET_NAME, Logo, TOUR_LIST } from './constants';
import { 
  getWhatsAppLink, 
  generateWhatsAppMessage, 
  generateDriverArrivalWhatsAppMessage,
  generateDriverDepartureWhatsAppMessage,
  generateDriverWhatsAppMessage,
  getDriverWhatsAppUrl,
  isAndroidWebView, 
  encodeVoucherToUrl, 
  decodeVoucherFromUrl, 
  openInSystemBrowser, 
  shareOrPrintVoucher,
  toMexicanDateFormat,
  toISOFormat,
  formatDateToSpanishLong,
  sendReservationToGoogleSheets,
  formatReservationToTSV,
  copyTextToClipboard,
  getReservationRows,
  getTargetSheetNameForDate,
  getReservationServiceDate,
  parseMexicanDateToTimestamp,
  sortReservationsChronologically,
  APPS_SCRIPT_REWRITE_CODE,
  getGoogleSheetsWebhookUrl,
  getGoogleSheetUrlForDate,
  testGoogleSheetsWebhook,
  openWhatsAppDirectly
} from './utils';
import { GoogleGenAI } from '@google/genai';
import { extractReservationFieldsWithRegex, normalizeReservationData, getClientGeminiApiKey } from './geminiService';
import VoucherPreview from './components/VoucherPreview';

const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mKo7CYV3Wf1LmuuslP0DmV9UTUFvGvE1JKFQihqFLvE/edit?usp=drivesdk";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [currentVoucher, setCurrentVoucher] = useState<Reservation | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isWebView, setIsWebView] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tourSuggestions, setTourSuggestions] = useState<{index: number, list: string[]}>({ index: -1, list: [] });
  const [pdfSingleTourIndex, setPdfSingleTourIndex] = useState<number | null>(null);
  const [previewLanguage, setPreviewLanguage] = useState<'es' | 'en'>('es');
  const [aiInputText, setAiInputText] = useState('');
  const [isParsingAI, setIsParsingAI] = useState(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);

  const [showWSModal, setShowWSModal] = useState<{
    show: boolean;
    type: 'driver' | 'staff' | 'customer' | null;
    number: string;
    label: string;
  }>({ show: false, type: null, number: '', label: '' });

  const [showVoucherModal, setShowVoucherModal] = useState<{
    show: boolean;
    reservation: Reservation | null;
  }>({ show: false, reservation: null });

  const [driverStatusView, setDriverStatusView] = useState<{
    code: string;
    step: 'onboard' | 'completed';
    timestamp: string;
  } | null>(null);

  const [processingMaster, setProcessingMaster] = useState(false);
  const isProcessingMasterRef = React.useRef(false);
  const [sheetsFeedback, setSheetsFeedback] = useState<{
    show: boolean;
    type: 'success' | 'error';
    message: string;
    targetDate?: string;
    sheetName?: string;
  } | null>(null);

  const [showSheetsScriptModal, setShowSheetsScriptModal] = useState(false);
  const [customWebhookUrl, setCustomWebhookUrl] = useState(() => getGoogleSheetsWebhookUrl());
  const [copiedScript, setCopiedScript] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string; sheet?: string } | null>(null);

  const generateNewId = () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `QTC${randomPart}`;
  };

  const initialFormState: Omit<Reservation, 'id' | 'createdAt'> = {
    reservationNo: '',
    rep: '',
    agency: '',
    company: '',
    name: '',
    serviceType: 'Llegada y Salida',
    transferSubtype: 'Traslado Sencillo',
    tourType: 'Tour Compartido',
    tourName: '',
    observations: '',
    origin: '', 
    destination: '', 
    arrivalName: '',
    arrivalDestination: '',
    peopleCountArrival: 1,
    departureName: '',
    departureDestination: '',
    peopleCountDeparture: 1,
    dateArrival: '',
    dateDeparture: '',
    arrivalTime: '',
    flightNoArrival: '',
    airlineArrival: '',
    originDeparture: '',
    departureTimeHotel: '',
    departureTimeFlight: '',
    extraLegs: [],
    extraTours: [],
    circuitoLegs: [],
    unitType: '1 a 8 personas',
    includedThings: '',
    notIncludedThings: '',
    peopleCount: 1,
    depositMxn: 0,
    toPayMxn: 0,
    depositUsd: 0,
    toPayUsd: 0,
    roomNumber: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [reservationSearch, setReservationSearch] = useState('');

  useEffect(() => {
    setIsWebView(isAndroidWebView());

    // Check if voucher is provided via URL parameter (e.g. from WebView handoff to Chrome)
    const sharedVoucher = decodeVoucherFromUrl();
    if (sharedVoucher) {
      setCurrentVoucher(sharedVoucher);
      setShowVoucherModal({ show: true, reservation: sharedVoucher });
      showUIMessage(`📄 Voucher #${sharedVoucher.reservationNo} cargado`);
    }

    const saved = localStorage.getItem('qt_reservations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Sanitizar y limpiar reservas previas que tenían fechas falsas de llegada (ej. tours con dateArrival sucio)
        const sanitized = Array.isArray(parsed) ? parsed.map((r: any) => {
          const service = String(r.serviceType || '').toLowerCase();
          if (service.includes('tour') || service.includes('excursi')) {
            const tourDate = r.tourDate || r.dateDeparture || r.date || r.extraTours?.[0]?.dateDeparture;
            return {
              ...r,
              date: tourDate || r.date,
              dateDeparture: tourDate || r.dateDeparture,
              dateArrival: '', // Limpiar fecha falsa de llegada en tours
            };
          }
          if (service.includes('salida') && !service.includes('llegada')) {
            return {
              ...r,
              date: r.dateDeparture || r.date,
              dateArrival: '',
            };
          }
          if (service.includes('traslado')) {
            return {
              ...r,
              date: r.dateDeparture || r.date,
              dateArrival: '',
            };
          }
          if (service.includes('solo llegada')) {
            return {
              ...r,
              date: r.dateArrival || r.date,
              dateDeparture: '',
            };
          }
          return r;
        }) : [];
        const sorted = sortReservationsChronologically(sanitized);
        setReservations(sorted);
        localStorage.setItem('qt_reservations', JSON.stringify(sorted));
      } catch (e) {
        console.error("Error parsing saved reservations:", e);
      }
    }

    // Restore draft if exists
    const draft = localStorage.getItem('qt_draft_voucher');
    if (draft) {
      try {
        const { formData: savedDraft, editingId: savedEditingId, savedAt } = JSON.parse(draft);
        if (savedDraft) {
          const service = String(savedDraft.serviceType || '').toLowerCase();
          if (service.includes('tour') || service.includes('excursi') || (service.includes('salida') && !service.includes('llegada')) || service.includes('traslado')) {
            savedDraft.dateArrival = '';
          }
          if (savedDraft.dateArrival) savedDraft.dateArrival = toMexicanDateFormat(savedDraft.dateArrival);
          if (savedDraft.dateDeparture) savedDraft.dateDeparture = toMexicanDateFormat(savedDraft.dateDeparture);
          if (savedDraft.date) savedDraft.date = toMexicanDateFormat(savedDraft.date);
          setFormData(savedDraft);
          if (savedEditingId) setEditingId(savedEditingId);
          if (savedAt) {
            const date = new Date(savedAt);
            setLastAutoSaved(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
          }
          showUIMessage('✏️ Borrador recuperado automáticamente');
        }
      } catch (e) {
        console.error("Error loading draft:", e);
      }
    } else if (!editingId && formData.reservationNo === '') {
      setFormData(prev => ({ ...prev, reservationNo: generateNewId() }));
    }

    // Check if opened from a driver status link (/status/:code?step=onboard|completed)
    try {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const stepParam = searchParams.get('step');
      if (path.includes('/status') || stepParam) {
        let code = '';
        const match = path.match(/\/status\/([^/?#]+)/);
        if (match && match[1]) {
          code = decodeURIComponent(match[1]);
        } else if (searchParams.get('code')) {
          code = searchParams.get('code') || '';
        }
        if (code || stepParam) {
          const stepVal = stepParam === 'completed' ? 'completed' : 'onboard';
          setDriverStatusView({
            code: code || 'SERVICIO',
            step: stepVal,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      }
    } catch (e) {
      console.warn("Status link detection error:", e);
    }
  }, []);

  // Auto-save draft every 30 seconds while editing in 'create' tab
  useEffect(() => {
    if (activeTab !== 'create') return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const draftData = {
        formData,
        editingId,
        savedAt: now.toISOString()
      };
      localStorage.setItem('qt_draft_voucher', JSON.stringify(draftData));
      setLastAutoSaved(timeStr);
    }, 30000);

    return () => clearInterval(interval);
  }, [formData, editingId, activeTab]);

  const resetForm = () => {
    localStorage.removeItem('qt_draft_voucher');
    setLastAutoSaved(null);
    setEditingId(null);
    setFormData({
      ...initialFormState,
      reservationNo: generateNewId()
    });
    showUIMessage('🧹 Formulario e historial de borrador limpiados.');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    if (name === 'tourName') {
      if (value.length >= 3) {
        const filtered = TOUR_LIST.filter(tour => tour.toLowerCase().includes(value.toLowerCase()));
        setTourSuggestions({ index: 0, list: filtered });
      } else {
        setTourSuggestions({ index: -1, list: [] });
      }
    }

    if (name === 'rep' || name === 'agency' || name === 'company') {
      setFormData(prev => ({
        ...prev,
        rep: value,
        agency: value,
        company: value
      }));
      return;
    }

    const isNumeric = ['peopleCountArrival', 'peopleCountDeparture', 'peopleCount', 'depositMxn', 'toPayMxn', 'depositUsd', 'toPayUsd'].includes(name);

    setFormData(prev => ({ 
      ...prev, 
      [name]: isNumeric 
        ? parseFloat(value) || 0 
        : value 
    }));
  };

  const handleTourLegInputChange = (id: string, field: keyof TourLeg, value: any) => {
    if (field === 'tourName' && typeof value === 'string' && value.length >= 3) {
      const idx = formData.extraTours?.findIndex(t => t.id === id) ?? -1;
      const filtered = TOUR_LIST.filter(tour => tour.toLowerCase().includes(value.toLowerCase()));
      setTourSuggestions({ index: idx + 1, list: filtered });
    } else if (field === 'tourName') {
      setTourSuggestions({ index: -1, list: [] });
    }

    setFormData(prev => ({
      ...prev,
      extraTours: prev.extraTours?.map(tour => 
        tour.id === id ? { ...tour, [field]: value } : tour
      )
    }));
  };

  const handleTourSelect = (tour: string, index: number) => {
    if (index === 0) {
      setFormData(prev => ({ ...prev, tourName: tour }));
    } else {
      const tourId = formData.extraTours?.[index - 1]?.id;
      if (tourId) {
        handleTourLegInputChange(tourId, 'tourName', tour);
      }
    }
    setTourSuggestions({ index: -1, list: [] });
  };

  const addTourLeg = () => {
    const newLeg: TourLeg = {
      id: Date.now().toString(),
      tourName: '',
      tourType: formData.tourType || 'Tour Compartido',
      originDeparture: formData.originDeparture,
      peopleCountDeparture: formData.peopleCountDeparture,
      departureTimeHotel: '',
      dateDeparture: formData.dateDeparture,
      observations: ''
    };
    setFormData(prev => ({
      ...prev,
      extraTours: [...(prev.extraTours || []), newLeg]
    }));
  };

  const removeTourLeg = (id: string) => {
    setFormData(prev => ({
      ...prev,
      extraTours: prev.extraTours?.filter(tour => tour.id !== id)
    }));
  };

  const addCircuitoLeg = () => {
    const newLeg: CircuitoLeg = {
      id: Date.now().toString(),
      date: toMexicanDateFormat(formData.dateArrival) || toMexicanDateFormat(new Date().toISOString().split('T')[0]),
      placesToVisit: '',
      schedule: '',
      entranceCosts: '',
      pricePerDay: '',
      observations: ''
    };
    setFormData(prev => ({
      ...prev,
      circuitoLegs: [...(prev.circuitoLegs || []), newLeg]
    }));
  };

  const removeCircuitoLeg = (id: string) => {
    setFormData(prev => ({
      ...prev,
      circuitoLegs: prev.circuitoLegs?.filter(leg => leg.id !== id)
    }));
  };

  const handleCircuitoLegInputChange = (id: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      circuitoLegs: prev.circuitoLegs?.map(leg => 
        leg.id === id ? { ...leg, [field]: value } : leg
      )
    }));
  };

  const addTransferLeg = () => {
    const newLeg: TransferLeg = {
      id: Date.now().toString(),
      origin: '',
      destination: '',
      pax: formData.peopleCountDeparture,
      startTime: '',
      returnTime: '',
      date: toMexicanDateFormat(formData.dateDeparture) || toMexicanDateFormat(new Date().toISOString().split('T')[0])
    };
    setFormData(prev => ({
      ...prev,
      extraLegs: [...(prev.extraLegs || []), newLeg]
    }));
  };

  const updateTransferLeg = (id: string, field: keyof TransferLeg, value: any) => {
    setFormData(prev => ({
      ...prev,
      extraLegs: prev.extraLegs?.map(leg => 
        leg.id === id ? { ...leg, [field]: value } : leg
      )
    }));
  };

  const removeTransferLeg = (id: string) => {
    setFormData(prev => ({
      ...prev,
      extraLegs: prev.extraLegs?.filter(leg => leg.id !== id)
    }));
  };

  const showUIMessage = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const handleProcessAndGenerateVoucher = async () => {
    if (processingMaster || isProcessingMasterRef.current) return;
    isProcessingMasterRef.current = true;
    setProcessingMaster(true);

    try {
      let resolvedName = formData.name;
      let resolvedPeopleCount = formData.peopleCount;

      if (formData.serviceType === "Llegada y Salida") {
        resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
        resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 1;
      } else if (formData.serviceType === "Solo Llegada") {
        resolvedName = formData.arrivalName || formData.name || '';
        resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 1;
      } else {
        // Solo Salida, Solo Traslado, Tour o Excursión, Circuito
        resolvedName = formData.departureName || formData.name || '';
        resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 1;
      }

      const isTour = /tour/i.test(formData.serviceType || '') || /excursi/i.test(formData.serviceType || '');
      const isSalida = /salida/i.test(formData.serviceType || '') && !/llegada/i.test(formData.serviceType || '');
      const isTraslado = /traslado/i.test(formData.serviceType || '');
      const isCircuito = /circuito/i.test(formData.serviceType || '');
      const isArrivalOnly = /solo llegada/i.test(formData.serviceType || '');

      let finalArrivalDate = '';
      let finalDepartureDate = '';
      let finalGeneralDate = '';

      if (isTour) {
        const rawDate = formData.tourDate || formData.dateDeparture || formData.date || formData.extraTours?.[0]?.dateDeparture || formData.dateArrival || '';
        finalGeneralDate = toMexicanDateFormat(rawDate);
        finalDepartureDate = finalGeneralDate;
        finalArrivalDate = ''; // NUNCA poner fecha de llegada en tours
      } else if (isSalida || isTraslado) {
        const rawDate = formData.dateDeparture || formData.date || formData.dateArrival || '';
        finalGeneralDate = toMexicanDateFormat(rawDate);
        finalDepartureDate = finalGeneralDate;
        finalArrivalDate = ''; // NUNCA poner fecha de llegada en solo salida o traslado
      } else if (isCircuito) {
        const rawDate = formData.circuitoLegs?.[0]?.date || formData.dateArrival || formData.dateDeparture || formData.date || '';
        finalGeneralDate = toMexicanDateFormat(rawDate);
        finalArrivalDate = finalGeneralDate;
        finalDepartureDate = '';
      } else if (isArrivalOnly) {
        const rawDate = formData.dateArrival || formData.date || formData.dateDeparture || '';
        finalGeneralDate = toMexicanDateFormat(rawDate);
        finalArrivalDate = finalGeneralDate;
        finalDepartureDate = '';
      } else {
        // Llegada y Salida (redondo)
        const rawArr = formData.dateArrival || formData.date || formData.dateDeparture || '';
        const rawDep = formData.dateDeparture || formData.date || formData.dateArrival || '';
        finalArrivalDate = toMexicanDateFormat(rawArr);
        finalDepartureDate = toMexicanDateFormat(rawDep);
        finalGeneralDate = finalArrivalDate || finalDepartureDate;
      }

      const finalData: any = { 
        ...formData, 
        name: resolvedName,
        peopleCount: resolvedPeopleCount,
        arrivalName: isArrivalOnly || (!isTour && !isSalida && !isTraslado) ? (formData.arrivalName || resolvedName) : '',
        departureName: (!isArrivalOnly) ? (formData.departureName || resolvedName) : '',
        origin: isTour ? (formData.originDeparture || 'Hotel / Punto de Encuentro') : (formData.origin || 'Aeropuerto de Cancún'),
        arrivalDestination: isTour ? (formData.tourName || 'Tour') : (formData.arrivalDestination || formData.destination || ''),
        originDeparture: formData.originDeparture || formData.arrivalDestination || formData.destination || '',
        departureDestination: isTour ? (formData.tourName || 'Tour') : (formData.departureDestination || 'Aeropuerto de Cancún'),
        peopleCountArrival: Number(formData.peopleCountArrival) || Number(resolvedPeopleCount) || 1,
        peopleCountDeparture: Number(formData.peopleCountDeparture) || Number(resolvedPeopleCount) || 1,
        date: finalGeneralDate,
        dateArrival: finalArrivalDate,
        dateDeparture: finalDepartureDate,
      };

      let updated: Reservation[];
      let savedRes: Reservation;
      const isEditing = Boolean(editingId);

      if (editingId) {
        const existingRes = reservations.find(r => String(r.id) === String(editingId));
        savedRes = { 
          ...finalData, 
          id: String(editingId), 
          reservationNo: formData.reservationNo, // PRESERVAR exactamente el mismo folio
          createdAt: existingRes?.createdAt || new Date().toISOString() 
        } as Reservation;

        // REESCRIBIR en memoria local: reemplaza la reserva existente y deduplica cualquier copia con el mismo folio
        updated = reservations.map(res => {
          if (String(res.id) === String(editingId) || (res.reservationNo && res.reservationNo === savedRes.reservationNo)) {
            return savedRes;
          }
          return res;
        });
      } else {
        const newRes: Reservation = {
          ...finalData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString(),
        } as Reservation;
        savedRes = newRes;

        // Evitar duplicaciones accidentales en memoria si ya existiera con el mismo folio
        const existingIdx = reservations.findIndex(r => r.reservationNo && r.reservationNo === newRes.reservationNo);
        if (existingIdx >= 0) {
          updated = reservations.map((r, idx) => idx === existingIdx ? newRes : r);
        } else {
          updated = [newRes, ...reservations];
        }
      }

      // a) Save reservation into app local memory (ordenada cronológicamente)
      const sortedUpdated = sortReservationsChronologically(updated);
      setReservations(sortedUpdated);
      localStorage.setItem('qt_reservations', JSON.stringify(sortedUpdated));
      localStorage.removeItem('qt_draft_voucher');
      setLastAutoSaved(null);
      setCurrentVoucher(savedRes);

      // Copiar preventivamente ambos tramos al portapapeles
      try {
        const tsv = formatReservationToTSV(savedRes);
        await copyTextToClipboard(tsv);
      } catch (cpErr) {
        console.warn("Clipboard copy in voucher processing:", cpErr);
      }

      // b) POST payload to Google Apps Script (para viaje redondo procesa y envía AMBOS tramos: 2 filas)
      let sheetsSuccess = false;
      try {
        sheetsSuccess = await sendReservationToGoogleSheets(savedRes, isEditing);
      } catch (err) {
        console.warn("Error enviando a Google Sheets:", err);
        sheetsSuccess = false;
      }

      // c) Feedback explícito mostrando confirmación de filas y hoja correspondiente
      const targetSheetName = getTargetSheetNameForDate(getReservationServiceDate(savedRes));
      const sheetDetail = targetSheetName ? ` (Hoja: ${targetSheetName})` : '';
      const rows = getReservationRows(savedRes);
      const isRoundTrip = rows.length > 1;

      const successFeedbackMsg = isRoundTrip
        ? (isEditing
            ? `✓ Ambos tramos (Llegada y Salida) actualizados con éxito en Google Sheets${sheetDetail}`
            : `✓ Ambos tramos (Llegada y Salida) guardados con éxito en Google Sheets (2 filas)${sheetDetail}`)
        : (isEditing
            ? `✓ Reserva reescrita y actualizada con éxito en Google Sheets${sheetDetail}`
            : `✓ Guardado con éxito en Google Sheets${sheetDetail}`);

      const serviceDate = getReservationServiceDate(savedRes) || savedRes.date || '';

      if (sheetsSuccess) {
        setSheetsFeedback({
          show: true,
          type: 'success',
          message: successFeedbackMsg,
          targetDate: serviceDate,
          sheetName: targetSheetName
        });
        showUIMessage(successFeedbackMsg);
      } else {
        setSheetsFeedback({
          show: true,
          type: 'error',
          message: '⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual',
          targetDate: serviceDate,
          sheetName: targetSheetName
        });
        showUIMessage("⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual");
      }

      // d) Open Voucher Preview
      setShowVoucherModal({ show: true, reservation: savedRes });

      // e) Automatically reset/clear form fields after processing
      setEditingId(null);
      setFormData({
        ...initialFormState,
        reservationNo: generateNewId()
      });
    } finally {
      setProcessingMaster(false);
      setTimeout(() => {
        isProcessingMasterRef.current = false;
      }, 1200);
    }
  };

  const handleSave = (andExportPdf: boolean = false) => {
    handleProcessAndGenerateVoucher();
  };

  const cancelEdit = () => {
    setEditingId(null);
    localStorage.removeItem('qt_draft_voucher');
    setLastAutoSaved(null);
    setFormData({
      ...initialFormState,
      reservationNo: generateNewId()
    });
    showUIMessage('ℹ️ Edición cancelada. Formulario reiniciado para nueva reserva.');
  };

  const handleDeleteReservation = (id: string) => {
    const resToDelete = reservations.find(r => String(r.id) === String(id));
    if (!resToDelete) return;
    if (window.confirm(`¿Deseas eliminar la reservación #${resToDelete.reservationNo} (${resToDelete.name})? Esta acción no se puede deshacer.`)) {
      const updated = reservations.filter(r => String(r.id) !== String(id));
      setReservations(updated);
      localStorage.setItem('qt_reservations', JSON.stringify(updated));
      if (editingId && String(editingId) === String(id)) {
        cancelEdit();
      }
      showUIMessage(`🗑️ Reservación #${resToDelete.reservationNo} eliminada.`);
    }
  };

  const handleCopyAppsScript = async () => {
    const ok = await copyTextToClipboard(APPS_SCRIPT_REWRITE_CODE);
    if (ok) {
      setCopiedScript(true);
      showUIMessage('✓ Código de Apps Script copiado al portapapeles');
      setTimeout(() => setCopiedScript(false), 2500);
    } else {
      showUIMessage('⚠️ Error copiando código');
    }
  };

  const handleSaveCustomWebhook = () => {
    const clean = customWebhookUrl.trim();
    if (clean.startsWith('https://script.google.com/')) {
      localStorage.setItem('qt_sheets_webhook_url', clean);
      showUIMessage('✓ URL del Webhook guardada exitosamente');
    } else {
      showUIMessage('⚠️ Ingresa una URL válida de Google Apps Script (https://script.google.com/...)');
    }
  };

  const handleTestWebhook = async () => {
    setTestingWebhook(true);
    setWebhookTestResult(null);
    try {
      const res = await testGoogleSheetsWebhook(customWebhookUrl);
      setWebhookTestResult(res);
      if (res.success) {
        showUIMessage(res.message);
      } else {
        showUIMessage(res.message);
      }
    } catch (err: any) {
      setWebhookTestResult({
        success: false,
        message: `Error al conectar con Webhook: ${err.message || 'Error de red'}`
      });
      showUIMessage('⚠️ Error de conexión con Webhook');
    } finally {
      setTestingWebhook(false);
    }
  };

  const handleEdit = (res: Reservation) => {
    setEditingId(res.id);
    const { id, createdAt, ...dataToEdit } = res;
    // Limpiar dateArrival espurio si es tour, solo salida o traslado para evitar fechas de llegada fantasma
    const service = String(res.serviceType || '').toLowerCase();
    if (service.includes('tour') || service.includes('excursi') || (service.includes('salida') && !service.includes('llegada')) || service.includes('traslado')) {
      dataToEdit.dateArrival = '';
    }
    // Merge with initial state to ensure all fields exist and keep reservationNo intact
    setFormData({
      ...initialFormState,
      ...dataToEdit,
      rep: res.rep || res.agency || res.company || '',
      agency: res.rep || res.agency || res.company || '',
      company: res.rep || res.agency || res.company || '',
      reservationNo: res.reservationNo
    });
    setActiveTab('create');
    setCurrentVoucher(res);
    setPreviewLanguage('es');
    showUIMessage(`✏️ Editando reserva #${res.reservationNo} — Al procesar se reescribirán los datos.`);
    // Scroll to top of window and main container so user immediately sees the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAIParsing = async () => {
    const rawText = aiInputText.trim();
    if (!rawText) return;
    setIsParsingAI(true);
    try {
      let regexData: Partial<Reservation> = {};
      try {
        regexData = extractReservationFieldsWithRegex(rawText);
      } catch (regexErr) {
        console.warn("Regex fallback warning:", regexErr);
      }

      let aiParsed: any = null;
      const apiKey = (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_GEMINI_API_KEY)
        ? process.env.NEXT_PUBLIC_GEMINI_API_KEY
        : getClientGeminiApiKey();

      if (apiKey) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const currentDate = new Date().toISOString().split('T')[0];
          const prompt = `Analiza el siguiente texto de reservación para Quick Travel Cancún y devuelve un objeto JSON válido con los campos encontrados:
passenger, name, rep, serviceType ("Llegada y Salida" | "Solo Llegada" | "Solo Salida" | "Solo Traslado" | "Tour o Excursión" | "Circuito"), transferSubtype, tourName, tourType, date (DD/MM/YYYY), dateArrival (DD/MM/YYYY), dateDeparture (DD/MM/YYYY), arrivalTime (HH:MM), departureTimeHotel (HH:MM), departureTimeFlight (HH:MM), flight, flightNoArrival, airlineArrival, origin, destination, arrivalDestination, originDeparture, departureDestination, pax (number), peopleCount (number), amount, depositMxn (number), toPayMxn (number), depositUsd (number), toPayUsd (number), roomNumber, observations.
rep (string: nombre del rep o representante de ventas/agencia si se indica, ej. "Paty Alamillo").
Fecha actual de referencia: ${currentDate}. Todas las fechas en formato DD/MM/YYYY.

Texto:
"""
${rawText}
"""`;

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
            },
          });

          const rawResponse = (response.text || '').replace(/```json|```/g, '').trim();
          const firstBrace = rawResponse.indexOf('{');
          const lastBrace = rawResponse.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
            const jsonCandidate = rawResponse.substring(firstBrace, lastBrace + 1);
            if (!jsonCandidate.startsWith('<')) {
              aiParsed = JSON.parse(jsonCandidate);
            }
          }
        } catch (sdkErr) {
          console.warn("Direct Gemini client SDK call failed, falling back to local regex:", sdkErr);
        }
      }

      const mergedRaw: any = { ...regexData };
      if (aiParsed && typeof aiParsed === 'object') {
        Object.keys(aiParsed).forEach(k => {
          if (aiParsed[k] !== undefined && aiParsed[k] !== null && aiParsed[k] !== '') {
            mergedRaw[k] = aiParsed[k];
          }
        });
      }

      const parsedData = normalizeReservationData(mergedRaw);

      if (parsedData && typeof parsedData === 'object' && Object.keys(parsedData).length > 0) {
        setFormData(prev => {
          const newData = { ...prev };
          Object.keys(parsedData).forEach(key => {
            if ((parsedData as any)[key] !== undefined && (parsedData as any)[key] !== null && (parsedData as any)[key] !== '') {
              (newData as any)[key] = (parsedData as any)[key];
            }
          });
          
          if (parsedData.name) {
            newData.arrivalName = parsedData.name;
            newData.departureName = parsedData.name;
          }
          if (parsedData.peopleCount) {
            newData.peopleCountArrival = parsedData.peopleCount;
            newData.peopleCountDeparture = parsedData.peopleCount;
          }

          return newData;
        });
        showUIMessage("✅ Datos extraídos y autocompletados con éxito.");
        setAiInputText('');
      } else {
        showUIMessage("No se encontraron datos de reserva en el texto.");
      }
    } catch (error: any) {
      console.warn("Error parsing reservation text:", error);
      showUIMessage("No se encontraron datos de reserva en el texto.");
    } finally {
      setIsParsingAI(false);
    }
  };

  const handlePrintVoucher = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const handleShareOrDownload = async (
    targetVoucher?: Reservation | null,
    elementId: string = 'voucher-modal-print',
    lang: 'es' | 'en' = 'es'
  ) => {
    const voucher = targetVoucher || currentVoucher;
    if (!voucher) {
      showUIMessage('⚠️ No hay voucher disponible');
      return;
    }

    // 1. Check if running inside an Android WebView (/wv/i.test(navigator.userAgent) or window.Android)
    if (isAndroidWebView()) {
      showUIMessage('🌐 Abriendo voucher en Chrome / Navegador externo...');
      const voucherUrl = encodeVoucherToUrl(voucher);
      openInSystemBrowser(voucherUrl);
      return;
    }

    // 2. If running in a standard browser, preserve the current native navigator.share / image download flow
    setIsExportingPDF(true);
    setPreviewLanguage(lang);
    try {
      const result = await shareOrPrintVoucher(elementId, voucher, lang);
      if (result.method === 'share-file' || result.method === 'share-text') {
        showUIMessage('📲 Menú para compartir activado');
      } else if (result.method === 'download') {
        showUIMessage('📥 Voucher descargado como imagen');
      }
    } catch (err) {
      console.error('Error al compartir o descargar voucher:', err);
      showUIMessage('⚠️ Error al procesar el voucher');
    } finally {
      setIsExportingPDF(false);
    }
  };

  const triggerWhatsAppModal = (type: 'driver' | 'staff' | 'customer') => {
    let defaultNum = '';
    let label = '';
    if (type === 'driver') { defaultNum = CONTACTS.DRIVER.number; label = 'Chofer'; }
    if (type === 'staff') { defaultNum = CONTACTS.STAFF.number; label = 'Staff'; }
    if (type === 'customer') { defaultNum = CONTACTS.CUSTOMER.number; label = 'Cliente'; }
    setShowWSModal({ show: true, type, number: defaultNum, label });
  };

  const handleSaveToSheets = async (targetRes?: Reservation | null) => {
    let resolvedName = formData.name;
    let resolvedPeopleCount = formData.peopleCount;

    if (formData.serviceType === "Llegada y Salida") {
      resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 0;
    } else if (formData.serviceType === "Solo Llegada") {
      resolvedName = formData.arrivalName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 0;
    } else {
      resolvedName = formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 0;
    }

    const isTour = /tour/i.test(formData.serviceType || '') || /excursi/i.test(formData.serviceType || '');
    const isSalida = /salida/i.test(formData.serviceType || '') && !/llegada/i.test(formData.serviceType || '');
    const isTraslado = /traslado/i.test(formData.serviceType || '');
    const isCircuito = /circuito/i.test(formData.serviceType || '');
    const isArrivalOnly = /solo llegada/i.test(formData.serviceType || '');

    let finalArrivalDate = '';
    let finalDepartureDate = '';
    let finalGeneralDate = '';

    if (isTour) {
      const rawDate = formData.tourDate || formData.dateDeparture || formData.date || formData.extraTours?.[0]?.dateDeparture || formData.dateArrival || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalDepartureDate = finalGeneralDate;
      finalArrivalDate = '';
    } else if (isSalida || isTraslado) {
      const rawDate = formData.dateDeparture || formData.date || formData.dateArrival || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalDepartureDate = finalGeneralDate;
      finalArrivalDate = '';
    } else if (isCircuito) {
      const rawDate = formData.circuitoLegs?.[0]?.date || formData.dateArrival || formData.dateDeparture || formData.date || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalArrivalDate = finalGeneralDate;
      finalDepartureDate = '';
    } else if (isArrivalOnly) {
      const rawDate = formData.dateArrival || formData.date || formData.dateDeparture || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalArrivalDate = finalGeneralDate;
      finalDepartureDate = '';
    } else {
      const rawArr = formData.dateArrival || formData.date || formData.dateDeparture || '';
      const rawDep = formData.dateDeparture || formData.date || formData.dateArrival || '';
      finalArrivalDate = toMexicanDateFormat(rawArr);
      finalDepartureDate = toMexicanDateFormat(rawDep);
      finalGeneralDate = finalArrivalDate || finalDepartureDate;
    }

    const currentFormDataRes: Reservation = {
      ...formData,
      id: editingId ? String(editingId) : (formData.reservationNo || generateNewId()),
      name: resolvedName,
      peopleCount: resolvedPeopleCount,
      date: finalGeneralDate,
      dateArrival: finalArrivalDate,
      dateDeparture: finalDepartureDate,
      createdAt: new Date().toISOString()
    } as Reservation;

    const hasFormData = Boolean(
      formData.name?.trim() || 
      formData.arrivalName?.trim() || 
      formData.departureName?.trim() || 
      formData.arrivalDestination?.trim() ||
      formData.originDeparture?.trim() ||
      formData.arrivalTime || 
      formData.departureTimeHotel
    );

    const resToSend: Reservation = targetRes || currentVoucher || (hasFormData ? currentFormDataRes : currentFormDataRes);

    setSyncing(true);
    let success = false;
    try {
      success = await sendReservationToGoogleSheets(resToSend, Boolean(editingId));
      const targetSheetName = getTargetSheetNameForDate(getReservationServiceDate(resToSend));
      const sheetDetail = targetSheetName ? ` (Hoja: ${targetSheetName})` : '';
      const serviceDate = getReservationServiceDate(resToSend) || resToSend.date || '';
      if (success) {
        setSheetsFeedback({
          show: true,
          type: 'success',
          message: `✓ Guardado con éxito en Google Sheets${sheetDetail} y ordenado cronológicamente`,
          targetDate: serviceDate,
          sheetName: targetSheetName
        });
        showUIMessage(`✓ Guardado con éxito en Google Sheets${sheetDetail} y ordenado cronológicamente`);
      } else {
        setSheetsFeedback({
          show: true,
          type: 'error',
          message: '⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual',
          targetDate: serviceDate,
          sheetName: targetSheetName
        });
        showUIMessage("⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual");
      }
    } catch (err) {
      console.warn("Error guardando en Google Sheets:", err);
      setSheetsFeedback({
        show: true,
        type: 'error',
        message: '⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual'
      });
      showUIMessage("⚠️ Error de conexión con Sheets. Por favor usa el botón de Respaldo Manual");
    } finally {
      setSyncing(false);
    }
    return success;
  };

  const handleManualBackup = async (targetRes?: Reservation | null) => {
    let resolvedName = formData.name;
    let resolvedPeopleCount = formData.peopleCount;

    if (formData.serviceType === "Llegada y Salida") {
      resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 1;
    } else if (formData.serviceType === "Solo Llegada") {
      resolvedName = formData.arrivalName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 1;
    } else {
      resolvedName = formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 1;
    }

    const isTour = /tour/i.test(formData.serviceType || '') || /excursi/i.test(formData.serviceType || '');
    const isSalida = /salida/i.test(formData.serviceType || '') && !/llegada/i.test(formData.serviceType || '');
    const isTraslado = /traslado/i.test(formData.serviceType || '');
    const isCircuito = /circuito/i.test(formData.serviceType || '');
    const isArrivalOnly = /solo llegada/i.test(formData.serviceType || '');

    let finalArrivalDate = '';
    let finalDepartureDate = '';
    let finalGeneralDate = '';

    if (isTour) {
      const rawDate = formData.tourDate || formData.dateDeparture || formData.date || formData.extraTours?.[0]?.dateDeparture || formData.dateArrival || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalDepartureDate = finalGeneralDate;
      finalArrivalDate = '';
    } else if (isSalida || isTraslado) {
      const rawDate = formData.dateDeparture || formData.date || formData.dateArrival || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalDepartureDate = finalGeneralDate;
      finalArrivalDate = '';
    } else if (isCircuito) {
      const rawDate = formData.circuitoLegs?.[0]?.date || formData.dateArrival || formData.dateDeparture || formData.date || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalArrivalDate = finalGeneralDate;
      finalDepartureDate = '';
    } else if (isArrivalOnly) {
      const rawDate = formData.dateArrival || formData.date || formData.dateDeparture || '';
      finalGeneralDate = toMexicanDateFormat(rawDate);
      finalArrivalDate = finalGeneralDate;
      finalDepartureDate = '';
    } else {
      const rawArr = formData.dateArrival || formData.date || formData.dateDeparture || '';
      const rawDep = formData.dateDeparture || formData.date || formData.dateArrival || '';
      finalArrivalDate = toMexicanDateFormat(rawArr);
      finalDepartureDate = toMexicanDateFormat(rawDep);
      finalGeneralDate = finalArrivalDate || finalDepartureDate;
    }

    const currentFormDataRes: Reservation = {
      ...formData,
      id: editingId ? String(editingId) : (formData.reservationNo || generateNewId()),
      name: resolvedName,
      peopleCount: resolvedPeopleCount,
      arrivalName: isArrivalOnly || (!isTour && !isSalida && !isTraslado) ? (formData.arrivalName || resolvedName) : '',
      departureName: (!isArrivalOnly) ? (formData.departureName || resolvedName) : '',
      origin: isTour ? (formData.originDeparture || 'Hotel / Punto de Encuentro') : (formData.origin || 'Aeropuerto de Cancún'),
      arrivalDestination: isTour ? (formData.tourName || 'Tour') : (formData.arrivalDestination || formData.destination || ''),
      originDeparture: formData.originDeparture || formData.arrivalDestination || formData.destination || '',
      departureDestination: isTour ? (formData.tourName || 'Tour') : (formData.departureDestination || 'Aeropuerto de Cancún'),
      peopleCountArrival: Number(formData.peopleCountArrival) || Number(resolvedPeopleCount) || 1,
      peopleCountDeparture: Number(formData.peopleCountDeparture) || Number(resolvedPeopleCount) || 1,
      date: finalGeneralDate,
      dateArrival: finalArrivalDate,
      dateDeparture: finalDepartureDate,
      createdAt: new Date().toISOString()
    } as Reservation;

    const hasFormData = Boolean(
      formData.name?.trim() || 
      formData.arrivalName?.trim() || 
      formData.departureName?.trim() || 
      formData.arrivalDestination?.trim() ||
      formData.originDeparture?.trim() ||
      formData.arrivalTime || 
      formData.departureTimeHotel
    );

    // Priorizar el voucher activo o targetRes si existen para respetar sus fechas confirmadas
    const resToBackup = targetRes || currentVoucher || (hasFormData ? currentFormDataRes : currentFormDataRes);

    setSyncing(true);

    // 1. Obtener ambos tramos si es viaje redondo (Llegada y Salida)
    const rows = getReservationRows(resToBackup);
    const isRoundTrip = rows.length > 1;

    // 2. Formatear ambos tramos en TSV separados por salto de línea (\n)
    // Para viaje redondo: Fila 1 (Llegada) \n Fila 2 (Salida)
    const tsvRow = formatReservationToTSV(resToBackup);

    // 3. Copiar ambos tramos directamente al portapapeles del sistema
    await copyTextToClipboard(tsvRow);

    // 4. Enviar y procesar también a Google Sheets vía webhook en segundo plano (ambos tramos)
    try {
      sendReservationToGoogleSheets(resToBackup, Boolean(editingId));
    } catch (e) {
      console.warn("Background webhook sync error:", e);
    }

    // 5. Retroalimentación clara al usuario con nombre de hoja destino
    const targetServiceDate = getReservationServiceDate(resToBackup) || rows[0]?.date || resToBackup.date;
    const targetSheet = getTargetSheetNameForDate(targetServiceDate);
    const sheetInfo = targetSheet ? ` en la hoja "${targetSheet}"` : '';
    const alertMsg = isRoundTrip
      ? `✓ Ambas filas copiadas. Pégalas${sheetInfo} de Google Sheets.`
      : `✓ Fila copiada (${targetServiceDate || ''}). Pégala${sheetInfo} de Google Sheets.`;
    showUIMessage(alertMsg);
    setSheetsFeedback({
      show: true,
      type: 'success',
      message: `${alertMsg} Ordenado cronológicamente.`,
      targetDate: targetServiceDate,
      sheetName: targetSheet
    });

    // 6. Abrir la URL del documento de Google Sheets dirigida directamente a la pestaña del mes correspondiente
    const targetSheetUrl = getGoogleSheetUrlForDate(targetServiceDate);
    setTimeout(() => {
      setSyncing(false);
      try {
        if (isAndroidWebView()) {
          openInSystemBrowser(targetSheetUrl);
        } else {
          const win = window.open(targetSheetUrl, '_blank', 'noopener,noreferrer');
          if (!win) {
            const a = document.createElement('a');
            a.href = targetSheetUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }
      } catch (err) {
        console.warn("Error abriendo Google Sheets:", err);
      }
    }, 150);
  };

  const handleSendToDriver = (legType: 'arrival' | 'departure', targetRes?: Reservation | null) => {
    let resolvedName = formData.name;
    let resolvedPeopleCount = formData.peopleCount;

    if (formData.serviceType === "Llegada y Salida") {
      resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 0;
    } else if (formData.serviceType === "Solo Llegada") {
      resolvedName = formData.arrivalName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 0;
    } else {
      resolvedName = formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 0;
    }

    let resToSend: Reservation;
    if (targetRes) {
      resToSend = targetRes;
    } else if (resolvedName && resolvedName.trim().length > 0) {
      resToSend = {
        ...formData,
        id: editingId ? String(editingId) : (formData.reservationNo || generateNewId()),
        name: resolvedName,
        peopleCount: resolvedPeopleCount,
        createdAt: new Date().toISOString()
      } as Reservation;
    } else if (currentVoucher && currentVoucher.name) {
      resToSend = currentVoucher;
    } else {
      resToSend = {
        ...formData,
        id: editingId ? String(editingId) : (formData.reservationNo || generateNewId()),
        name: resolvedName,
        peopleCount: resolvedPeopleCount,
        createdAt: new Date().toISOString()
      } as Reservation;
    }

    const message = legType === 'arrival'
      ? generateDriverArrivalWhatsAppMessage(resToSend)
      : generateDriverDepartureWhatsAppMessage(resToSend);

    openWhatsAppDirectly(message);
    const legLabel = legType === 'arrival' ? 'Llegada' : 'Salida';
    showUIMessage(`📲 Abriendo WhatsApp para enviar ${legLabel} al chofer...`);
  };

  const confirmAndSendWhatsApp = () => {
    const voucher = currentVoucher || formData;
    const message = showWSModal.type === 'driver' 
      ? generateDriverWhatsAppMessage(voucher as Reservation)
      : generateWhatsAppMessage(voucher as Reservation);
    openWhatsAppDirectly(message, showWSModal.number);
    setShowWSModal(prev => ({ ...prev, show: false }));
  };

  const showArrival = formData.serviceType === "Llegada y Salida" || formData.serviceType === "Solo Llegada";
  const showDeparture = formData.serviceType === "Llegada y Salida" || formData.serviceType === "Solo Salida";
  const showTransfer = formData.serviceType === "Solo Traslado";
  const showTour = formData.serviceType === "Tour o Excursión";
  const showCircuito = formData.serviceType === "Circuito";

  const gridColsClass = (showArrival && (showDeparture || showTransfer || showTour || showCircuito)) ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col xl:flex-row font-sans text-slate-800">
      {showWSModal.show && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-sm rounded-[40px] shadow-2xl overflow-hidden">
            <div className="bg-[#0a305e] p-8 text-white text-center">
              <i className="fab fa-whatsapp text-4xl text-green-400 mb-4 block"></i>
              <h3 className="text-2xl font-black uppercase">Enviar a {showWSModal.label}</h3>
            </div>
            <div className="p-8 space-y-6">
              <InputGroup label="Número de WhatsApp" name="wsNum" value={showWSModal.number} onChange={(e: any) => setShowWSModal(p => ({...p, number: e.target.value}))} />
              <div className="flex gap-4">
                <button onClick={() => setShowWSModal(p => ({...p, show: false}))} className="flex-1 py-4 bg-gray-100 rounded-2xl font-black uppercase text-[10px]">Cancelar</button>
                <button onClick={confirmAndSendWhatsApp} className="flex-2 py-4 bg-[#25D366] text-white rounded-2xl font-black uppercase text-[10px]">Enviar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVoucherModal.show && showVoucherModal.reservation && (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-2 sm:p-4 overflow-y-auto modal-overlay">
          <div className="bg-white w-full max-w-4xl rounded-[32px] sm:rounded-[40px] shadow-2xl overflow-hidden my-auto animate-in zoom-in duration-200 modal-card flex flex-col max-h-[96vh]">
            <div className="bg-[#0a305e] px-6 py-4 sm:p-6 text-white flex justify-between items-center no-print shrink-0">
              <div className="flex items-center gap-3">
                <i className="fas fa-file-invoice text-2xl text-blue-300"></i>
                <div>
                  <h3 className="text-lg sm:text-xl font-black uppercase tracking-wide">Voucher de Confirmación</h3>
                  <p className="text-[11px] text-blue-200 font-medium">#{showVoucherModal.reservation.reservationNo} - {showVoucherModal.reservation.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={getGoogleSheetUrlForDate(getReservationServiceDate(showVoucherModal.reservation))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1.5 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase transition-all shadow-sm cursor-pointer"
                  title="Abrir hoja de Google Sheets en la pestaña del mes correspondiente"
                >
                  <i className="fas fa-external-link-alt text-[9px]"></i>
                  <span>VER EN SHEETS ({getTargetSheetNameForDate(getReservationServiceDate(showVoucherModal.reservation)) || 'HOJA'})</span>
                </a>
                <button 
                  onClick={() => setShowVoucherModal({ show: false, reservation: null })} 
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-all cursor-pointer"
                  title="Cerrar"
                >
                  <i className="fas fa-times text-xl"></i>
                </button>
              </div>
            </div>

            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs no-print shrink-0">
              <div className="flex items-center gap-2 text-emerald-800 font-bold">
                <i className="fas fa-check-circle text-emerald-600 text-sm"></i>
                <span>✓ Registrado en Google Sheets (Hoja: {getTargetSheetNameForDate(getReservationServiceDate(showVoucherModal.reservation)) || 'Mes correspondiente'})</span>
              </div>
              <a
                href={getGoogleSheetUrlForDate(getReservationServiceDate(showVoucherModal.reservation))}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex sm:hidden items-center gap-1 py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[9px] font-black uppercase transition-all cursor-pointer"
              >
                <i className="fas fa-external-link-alt text-[8px]"></i>
                <span>VER EN SHEETS</span>
              </a>
            </div>
            
            <div className="p-3 sm:p-6 md:p-8 overflow-y-auto bg-gray-50 flex-1">
              <VoucherPreview 
                id="voucher-modal-print"
                reservation={showVoucherModal.reservation} 
                pdfSingleTourIndex={pdfSingleTourIndex}
                language={previewLanguage}
              />
            </div>

            <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row items-center justify-end gap-3 no-print shrink-0">
              <button 
                type="button"
                onClick={() => setShowVoucherModal({ show: false, reservation: null })} 
                className="w-full sm:w-auto py-3.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <i className="fas fa-times text-xs text-slate-400"></i>
                <span>CERRAR</span>
              </button>

              <button 
                type="button"
                onClick={() => handleShareOrDownload(showVoucherModal.reservation!, 'voucher-modal-print', previewLanguage)} 
                disabled={isExportingPDF}
                className="w-full sm:w-auto flex-1 py-3.5 px-6 bg-[#0a305e] hover:bg-blue-900 text-white rounded-2xl font-black uppercase text-xs sm:text-sm shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
              >
                <i className={`fas ${isExportingPDF ? 'fa-spinner fa-spin' : (isWebView ? 'fa-external-link-alt' : 'fa-share-nodes')} text-base text-blue-300`}></i>
                <span>{isExportingPDF ? 'PREPARANDO VOUCHER...' : 'COMPARTIR / DESCARGAR VOUCHER'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {driverStatusView && (
        <div className="fixed inset-0 z-[400] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 text-center shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center text-3xl shadow-lg ${driverStatusView.step === 'onboard' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-[#0a305e]'}`}>
              {driverStatusView.step === 'onboard' ? '🚖' : '🏁'}
            </div>
            
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
              Quick Travel Cancún • Control Operativo
            </span>

            <h2 className="text-xl font-black text-slate-900 uppercase mt-4">
              {driverStatusView.step === 'onboard' ? 'Cliente a Bordo' : 'Servicio Finalizado'}
            </h2>

            <div className="my-5 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Orden:</span>
                <span className="font-mono font-black text-[#0a305e]">{driverStatusView.code}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Estatus:</span>
                <span className="font-bold text-emerald-600 uppercase">
                  {driverStatusView.step === 'onboard' ? '🟢 En camino al destino' : '✅ Completado'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-bold uppercase">Hora registrada:</span>
                <span className="font-medium text-slate-700">{driverStatusView.timestamp} hrs</span>
              </div>
            </div>

            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              {driverStatusView.step === 'onboard'
                ? 'El abordaje del cliente ha sido registrado en el sistema. Conduzca con precaución hacia el destino acordado.'
                : 'El servicio ha sido marcado como finalizado con éxito. ¡Excelente trabajo!'}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => {
                  const statusLabel = driverStatusView.step === 'onboard' ? 'Cliente a bordo (En camino)' : 'Servicio finalizado con éxito';
                  const message = `🚖 *REPORTE CHOFER - QUICK TRAVEL CANCÚN*\n\n📋 *Orden:* ${driverStatusView.code}\n📍 *Estatus:* ${statusLabel}\n⏰ *Hora:* ${driverStatusView.timestamp} hrs`;
                  openWhatsAppDirectly(message, '529982127348');
                }}
                className="w-full py-4 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-2xl font-black uppercase text-xs shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <i className="fab fa-whatsapp text-base"></i>
                <span>Notificar a Cabina por WhatsApp</span>
              </button>

              <button
                onClick={() => {
                  setDriverStatusView(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black uppercase text-xs transition-all"
              >
                Ir al Sistema Principal
              </button>
            </div>
          </div>
        </div>
      )}

      {showSheetsScriptModal && (
        <div className="fixed inset-0 z-[450] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[32px] sm:rounded-[40px] shadow-2xl overflow-hidden my-auto animate-in zoom-in duration-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-800 to-teal-900 px-6 py-5 sm:p-6 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-300 text-lg">
                  <i className="fas fa-file-code"></i>
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-wide">
                    Reescritura Automática en Google Sheets
                  </h3>
                  <p className="text-[11px] text-emerald-200 font-medium">
                    Actualiza la misma fila al editar sin duplicar registros
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setShowSheetsScriptModal(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-all cursor-pointer"
                title="Cerrar"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-7 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">
              {/* Info Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-950 text-xs leading-relaxed space-y-2">
                <div className="flex items-center gap-2 font-black text-emerald-900 uppercase">
                  <i className="fas fa-circle-check text-emerald-600 text-sm"></i>
                  <span>Actualización: Registro Cronológico, Hojas por Mes y REP en Agencia de Viajes</span>
                </div>
                <p>
                  El nuevo script de Google Apps Script incluye todas las correcciones necesarias:
                </p>
                <ul className="list-disc list-inside space-y-1.5 pl-1 text-[11px] text-emerald-900">
                  <li><strong>Enrutamiento por mes y año:</strong> Si la reserva es para <em>19/01/2027</em> va a <em>"enero 2027"</em>; si es para noviembre va a <em>"noviembre 2026"</em>; si es diciembre va a <em>"diciembre 2026"</em>, etc. (o crea la hoja automáticamente si no existe).</li>
                  <li><strong>Orden cronológico estricto:</strong> Se ordenan de menor a mayor por fecha (Día, Mes, Año) y por hora (manejando tanto AM / PM como 24 horas).</li>
                  <li><strong>Campo REP en Agencia de Viajes:</strong> Guarda el nombre del representante / REP en la columna <em>"AGENCIA DE VIAJES"</em> (y en <em>"REP"</em> si existe la columna).</li>
                  <li><strong>Reescritura por Folio:</strong> Al editar una reserva, localiza y actualiza la misma fila sin duplicar.</li>
                </ul>
                <div className="pt-2 flex flex-wrap gap-2">
                  <a
                    href={GOOGLE_SHEET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 py-2 px-3.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase transition-all shadow-sm"
                  >
                    <i className="fas fa-external-link-alt text-xs"></i>
                    <span>Abrir Hoja de Google Sheets</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleCopyAppsScript}
                    className="inline-flex items-center gap-1.5 py-2 px-3.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer shadow-sm"
                  >
                    <i className={`fas ${copiedScript ? 'fa-check text-emerald-600' : 'fa-copy text-emerald-600'} text-xs`}></i>
                    <span>{copiedScript ? '¡Código Copiado!' : 'Copiar Código de Apps Script'}</span>
                  </button>
                </div>
              </div>

              {/* Instructions steps */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                  <i className="fas fa-list-ol text-blue-600"></i>
                  Pasos sencillos para actualizar el script en tu Google Sheet:
                </h4>
                <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside pl-1 leading-relaxed">
                  <li>Abre tu documento de Google Sheets y en el menú superior haz clic en <strong>Extensiones &gt; Apps Script</strong>.</li>
                  <li>Borra todo lo que esté en <strong>Código.gs</strong> y pega el código copiado de abajo.</li>
                  <li>Haz clic en <strong>Guardar (icono de disquete)</strong> y luego en <strong>Implementar &gt; Nueva implementación</strong>.</li>
                  <li>En el engrane selecciona <strong>Aplicación web</strong>:
                    <ul className="list-disc list-inside pl-4 mt-1 text-[11px] text-slate-500 space-y-0.5">
                      <li><strong>Ejecutar como:</strong> Yo (tu correo)</li>
                      <li><strong>Quién tiene acceso:</strong> Cualquier usuario (Anyone)</li>
                    </ul>
                  </li>
                  <li>Haz clic en <strong>Implementar</strong>, copia la URL de la aplicación web que termina en <em>/exec</em>, pégala aquí abajo y haz clic en <strong>Guardar URL</strong> y <strong>Probar Conexión</strong>.</li>
                </ol>
              </div>

              {/* Code Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                    Código de Apps Script (Código.gs)
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyAppsScript}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <i className="fas fa-copy"></i>
                    <span>{copiedScript ? 'Copiado' : 'Copiar todo el código'}</span>
                  </button>
                </div>
                <div className="relative">
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                    {APPS_SCRIPT_REWRITE_CODE}
                  </pre>
                </div>
              </div>

              {/* Webhook URL config & test */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 space-y-3">
                <label className="block text-[11px] font-black uppercase text-slate-700 tracking-wider">
                  URL del Webhook de Google Apps Script
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={customWebhookUrl}
                    onChange={(e) => setCustomWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveCustomWebhook}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition-all shrink-0 cursor-pointer"
                  >
                    Guardar URL
                  </button>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook}
                    className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase transition-all shrink-0 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <i className={`fas ${testingWebhook ? 'fa-spinner fa-spin' : 'fa-plug'}`}></i>
                    <span>{testingWebhook ? 'Probando...' : 'Probar Conexión'}</span>
                  </button>
                </div>

                {webhookTestResult && (
                  <div className={`p-3 rounded-xl text-xs font-bold border transition-all ${
                    webhookTestResult.success ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}>
                    <i className={`fas ${webhookTestResult.success ? 'fa-check-circle text-emerald-600' : 'fa-exclamation-triangle text-rose-600'} mr-2`}></i>
                    {webhookTestResult.message}
                  </div>
                )}

                <p className="text-[10px] text-slate-400">
                  Por defecto usa el webhook ya vinculado a tu hoja. Si creas una nueva implementación en Apps Script, pega la nueva URL aquí y pruébala.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowSheetsScriptModal(false)}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase transition-all cursor-pointer"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={handleCopyAppsScript}
                className="py-2.5 px-5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <i className={`fas ${copiedScript ? 'fa-check' : 'fa-copy'}`}></i>
                <span>{copiedScript ? '¡Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetsFeedback && sheetsFeedback.show && (
        <div className="fixed top-5 right-5 z-[500] max-w-md w-[calc(100%-2.5rem)] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`p-4 sm:p-5 rounded-2xl shadow-2xl border flex flex-col gap-3 backdrop-blur-md ${
            sheetsFeedback.type === 'success' 
              ? 'bg-slate-900/95 border-emerald-500 text-white' 
              : 'bg-slate-900/95 border-amber-500 text-white'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  sheetsFeedback.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                }`}>
                  <i className={`fas ${sheetsFeedback.type === 'success' ? 'fa-check' : 'fa-exclamation-triangle'} text-sm`}></i>
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                    Sincronización con Google Sheets
                  </h4>
                  <p className="text-xs font-bold mt-0.5 text-slate-100">
                    {sheetsFeedback.message}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSheetsFeedback(null)} 
                className="text-slate-400 hover:text-white transition-colors p-1 cursor-pointer"
                title="Cerrar notificación"
              >
                <i className="fas fa-times text-xs"></i>
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
              {sheetsFeedback.type === 'success' ? (
                <a
                  href={getGoogleSheetUrlForDate(sheetsFeedback.targetDate || (currentVoucher ? getReservationServiceDate(currentVoucher) : null))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-center rounded-xl text-[11px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <i className="fas fa-external-link-alt text-[10px]"></i>
                  <span>VER HOJA ({sheetsFeedback.sheetName || 'MES CORRESPONDIENTE'})</span>
                </a>
              ) : (
                <button
                  onClick={() => {
                    setSheetsFeedback(null);
                    handleManualBackup(currentVoucher);
                  }}
                  className="flex-1 py-2 px-3 bg-amber-600 hover:bg-amber-500 text-white text-center rounded-xl text-[11px] font-black uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
                >
                  <i className="fas fa-sync-alt text-[10px]"></i>
                  <span>RESPALDO MANUAL (SHEETS)</span>
                </button>
              )}
              <button
                onClick={() => setSheetsFeedback(null)}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-center rounded-xl text-[11px] font-bold uppercase transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[300] w-full max-w-md px-6">
          <div className="bg-slate-900 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center justify-between border border-white/10">
            <span className="font-bold text-xs uppercase">{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)}><i className="fas fa-times"></i></button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap justify-between items-center gap-3 z-50">
          <Logo height="h-10 sm:h-12" />
          <nav className="flex bg-gray-100 p-1 sm:p-1.5 rounded-2xl shrink-0">
            <button 
              type="button"
              onClick={() => { setActiveTab('create'); }} 
              className={`px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer ${activeTab === 'create' ? 'bg-white text-[#0a305e] shadow-xs' : 'text-gray-400'}`}
            >
              Nuevo Voucher
            </button>
            <button 
              type="button"
              onClick={() => setActiveTab('history')} 
              className={`px-3.5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'history' ? 'bg-white text-[#0a305e] shadow-xs' : 'text-gray-400'}`}
            >
              <span>Reservaciones</span>
              <span className="w-5 h-5 rounded-full bg-blue-100 text-[#0a305e] text-[9px] font-black flex items-center justify-center">
                {reservations.length}
              </span>
            </button>
          </nav>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-10 space-y-6 sm:space-y-10">
          {activeTab === 'create' ? (
            <div className="max-w-6xl mx-auto space-y-8 sm:space-y-12">
              <section className="bg-white p-5 sm:p-8 md:p-12 rounded-[32px] sm:rounded-[40px] shadow-2xl border border-gray-100">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl sm:text-2xl font-black uppercase">
                      {editingId ? 'Editar Reservación' : 'Registro de Servicio'}
                    </h2>
                    {editingId ? (
                      <span className="inline-flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-full text-[10px] font-black shadow-sm animate-in fade-in">
                        <i className="fas fa-edit text-xs"></i> Modo Edición (Reescritura)
                      </span>
                    ) : lastAutoSaved ? (
                      <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full text-[10px] font-black border border-emerald-200/60 shadow-sm animate-in fade-in">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Auto-guardado {lastAutoSaved}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 bg-blue-50/60 text-blue-600 px-3 py-1.5 rounded-full text-[10px] font-bold border border-blue-100/60">
                        <i className="fas fa-sync text-[9px] opacity-70"></i> Auto-guardado cada 30s
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {editingId ? (
                      <button 
                        type="button"
                        onClick={cancelEdit}
                        title="Cancelar edición y volver a nuevo registro"
                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black uppercase text-[10px] transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fas fa-times text-xs"></i> Cancelar Edición
                      </button>
                    ) : (
                      <button 
                        type="button"
                        onClick={resetForm}
                        title="Limpiar campos y borrar borrador"
                        className="px-4 py-2.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-2xl font-black uppercase text-[10px] transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <i className="fas fa-trash-alt text-xs"></i> Limpiar Formulario
                      </button>
                    )}
                    <div className="bg-blue-50 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-mono text-base sm:text-lg font-black text-blue-600">
                      #{formData.reservationNo}
                    </div>
                  </div>
                </div>

                {editingId && (
                  <div className="mb-8 p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-amber-950 animate-in fade-in shadow-sm">
                    <div className="flex items-center gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-md shrink-0">
                        <i className="fas fa-pen-to-square text-base"></i>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-black uppercase tracking-wide text-amber-900">
                            Modo Edición: Reservación #{formData.reservationNo}
                          </p>
                          <span className="bg-amber-200 text-amber-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">Reescribir</span>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                          Al presionar <strong>"GUARDAR CAMBIOS Y REESCRIBIR RESERVA"</strong>, esta reserva se actualizará en memoria y se registrará en Google Sheets corrigiendo los datos existentes.
                        </p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={cancelEdit}
                      className="py-2 px-3.5 bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 rounded-xl text-[10px] font-black uppercase transition-all cursor-pointer shadow-2xs"
                    >
                      <i className="fas fa-times mr-1"></i> Descartar cambios
                    </button>
                  </div>
                )}

                {/* AI Paste Section */}
                <section className="bg-gradient-to-br from-indigo-50 to-blue-50 p-6 md:p-8 rounded-[32px] border border-indigo-100 shadow-sm mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md">
                      <i className="fas fa-magic"></i>
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest">Autocompletar con IA</h3>
                      <p className="text-[10px] text-indigo-600 font-bold">Pega el texto del mensaje o correo y la IA llenará el formulario</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <textarea 
                      value={aiInputText}
                      onChange={(e) => setAiInputText(e.target.value)}
                      placeholder="Ej: Reserva para Juan Perez, 4 personas. Llegan el 15 de Octubre a las 14:30 en el vuelo AA123 a Cancún. Van al Hotel Riu. Salen el 20 de Octubre a las 10:00 AM..."
                      className="w-full h-24 p-4 rounded-2xl border-2 border-indigo-100 focus:border-indigo-400 outline-none text-xs text-slate-700 resize-none shadow-inner"
                    />
                    <button 
                      onClick={handleAIParsing}
                      disabled={isParsingAI || !aiInputText.trim()}
                      className="self-end px-8 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                    >
                      {isParsingAI ? (
                        <><i className="fas fa-spinner fa-spin"></i> Analizando...</>
                      ) : (
                        <><i className="fas fa-sparkles"></i> Autocompletar</>
                      )}
                    </button>
                  </div>
                </section>

                <div className={`grid grid-cols-1 ${gridColsClass} gap-12`}>
                  <div className="space-y-6">
                    <SectionTitle label="Datos Generales" icon="fa-user" color="bg-blue-50 text-blue-600" />
                    <SelectGroup 
                      label="Tipo de Servicio" 
                      name="serviceType" 
                      value={formData.serviceType} 
                      onChange={handleInputChange} 
                      options={["Llegada y Salida", "Solo Llegada", "Solo Salida", "Solo Traslado", "Tour o Excursión", "Circuito"]} 
                    />

                    <InputGroup 
                      label="REP" 
                      name="rep" 
                      value={formData.rep || ''} 
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setFormData((prev: any) => ({
                          ...prev,
                          rep: val,
                          agency: val,
                          company: val
                        }));
                      }} 
                      placeholder="Nombre del Rep (opcional)"
                    />

                    <InputGroup 
                      label="Habitación (Room)" 
                      name="roomNumber" 
                      value={formData.roomNumber || ''} 
                      onChange={handleInputChange} 
                      placeholder="Ej: 102"
                    />
                    
                    <div className="space-y-4 pt-4 border-t border-gray-50">
                       <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Saldos Mexican Pesos (MXN)</h4>
                       <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Depósito MXN" name="depositMxn" type="number" value={formData.depositMxn.toString()} onChange={handleInputChange} />
                          <InputGroup label="A Pagar MXN" name="toPayMxn" type="number" value={formData.toPayMxn.toString()} onChange={handleInputChange} highlight />
                       </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-gray-50">
                       <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Saldos Dollars (USD)</h4>
                       <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Deposit USD" name="depositUsd" type="number" value={formData.depositUsd.toString()} onChange={handleInputChange} />
                          <InputGroup label="To Pay USD" name="toPayUsd" type="number" value={formData.toPayUsd.toString()} onChange={handleInputChange} highlight />
                       </div>
                    </div>
                  </div>

                  {showArrival && (
                    <div className="space-y-6 bg-[#f8fafc] p-8 rounded-[32px] border border-slate-100 shadow-sm">
                      <SectionTitle label="Servicio Llegada" icon="fa-plane-arrival" color="bg-green-50 text-green-600" />
                      <InputGroup label="Nombre Pasajero" name="arrivalName" value={formData.arrivalName} onChange={handleInputChange} />
                      <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Pax" name="peopleCountArrival" type="number" value={formData.peopleCountArrival.toString()} onChange={handleInputChange} />
                        <InputGroup label="Origen (Term)" name="origin" value={formData.origin} onChange={handleInputChange} />
                      </div>
                      <InputGroup label="Destino" name="arrivalDestination" value={formData.arrivalDestination} onChange={handleInputChange} />
                      <InputGroup label="Número de Vuelo" name="flightNoArrival" value={formData.flightNoArrival} onChange={handleInputChange} />
                      <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Fecha" name="dateArrival" type="date" value={formData.dateArrival} onChange={handleInputChange} />
                        <InputGroup label="Hora" name="arrivalTime" type="time" value={formData.arrivalTime} onChange={handleInputChange} />
                      </div>
                      <div className="flex flex-col group mt-4">
                        <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones (Llegada)</label>
                        <textarea 
                          name="observations" 
                          value={formData.observations} 
                          onChange={handleInputChange}
                          rows={3}
                          className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-green-500 outline-none transition-all shadow-sm"
                          placeholder="Notas u observaciones de la llegada..."
                        />
                      </div>
                    </div>
                  )}

                  {showDeparture && (
                    <div className="space-y-6 bg-[#fdfaf8] p-8 rounded-[32px] border border-orange-50 shadow-sm">
                      <SectionTitle label="Servicio Salida" icon="fa-plane-departure" color="bg-orange-50 text-orange-600" />
                      <InputGroup label="Nombre Pasajero" name="departureName" value={formData.departureName} onChange={handleInputChange} />
                      <InputGroup label="Origen Pickup" name="originDeparture" value={formData.originDeparture} onChange={handleInputChange} />
                      <InputGroup label="Destino" name="departureDestination" value={formData.departureDestination} onChange={handleInputChange} />
                      <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Pax" name="peopleCountDeparture" type="number" value={formData.peopleCountDeparture.toString()} onChange={handleInputChange} />
                        <InputGroup label="Pick-up Hotel" name="departureTimeHotel" type="time" value={formData.departureTimeHotel} onChange={handleInputChange} highlight />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <InputGroup label="Fecha" name="dateDeparture" type="date" value={formData.dateDeparture} onChange={handleInputChange} />
                        <InputGroup label="Hora Vuelo" name="departureTimeFlight" type="time" value={formData.departureTimeFlight} onChange={handleInputChange} />
                      </div>
                      <div className="flex flex-col group mt-4">
                        <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones (Salida)</label>
                        <textarea 
                          name="observations" 
                          value={formData.observations} 
                          onChange={handleInputChange}
                          rows={3}
                          className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-orange-500 outline-none transition-all shadow-sm"
                          placeholder="Notas u observaciones de la salida..."
                        />
                      </div>
                    </div>
                  )}

                  {showTransfer && (
                    <div className="space-y-6">
                      <div className="space-y-6 bg-[#f8f9fd] p-8 rounded-[32px] border border-blue-50 shadow-sm">
                        <SectionTitle label="Servicio de Traslado" icon="fa-exchange-alt" color="bg-blue-50 text-blue-700" />
                        <InputGroup label="Nombre Pasajero" name="departureName" value={formData.departureName} onChange={handleInputChange} />
                        <SelectGroup label="Sub-tipo" name="transferSubtype" value={formData.transferSubtype || 'Traslado Sencillo'} onChange={handleInputChange} options={["Traslado Sencillo", "Traslado Redondo", "Traslado Múltiple"]} />
                        <InputGroup label="Origen Traslado" name="originDeparture" value={formData.originDeparture} onChange={handleInputChange} />
                        <InputGroup label="Destino Traslado" name="departureDestination" value={formData.departureDestination} onChange={handleInputChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Pax" name="peopleCountDeparture" type="number" value={formData.peopleCountDeparture.toString()} onChange={handleInputChange} />
                          <InputGroup label="Hora Inicio" name="departureTimeHotel" type="time" value={formData.departureTimeHotel} onChange={handleInputChange} highlight />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Fecha" name="dateDeparture" type="date" value={formData.dateDeparture} onChange={handleInputChange} />
                          <InputGroup label="Hora Regreso" name="departureTimeFlight" type="time" value={formData.departureTimeFlight} onChange={handleInputChange} />
                        </div>
                        <div className="flex flex-col group mt-4">
                          <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones (Traslado)</label>
                          <textarea 
                            name="observations" 
                            value={formData.observations} 
                            onChange={handleInputChange}
                            rows={3}
                            className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm"
                            placeholder="Notas u observaciones del traslado..."
                          />
                        </div>
                        {formData.transferSubtype === "Traslado Múltiple" && (
                          <button onClick={addTransferLeg} className="mt-4 w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-xl shadow-lg"><i className="fas fa-plus"></i></button>
                        )}
                      </div>
                      {formData.transferSubtype === "Traslado Múltiple" && formData.extraLegs?.map((leg, idx) => (
                        <div key={leg.id} className="space-y-6 bg-gray-50 p-8 rounded-[32px] border border-gray-200 relative">
                          <button onClick={() => removeTransferLeg(leg.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><i className="fas fa-trash"></i></button>
                          <h4 className="text-[10px] font-black uppercase text-gray-400">Tramo Adicional #{idx + 1}</h4>
                          <InputGroup label="Origen" name={`l_o_${leg.id}`} value={leg.origin} onChange={(e: any) => updateTransferLeg(leg.id, 'origin', e.target.value)} />
                          <InputGroup label="Destino" name={`l_d_${leg.id}`} value={leg.destination} onChange={(e: any) => updateTransferLeg(leg.id, 'destination', e.target.value)} />
                          <div className="grid grid-cols-2 gap-4">
                            <InputGroup label="Pax" name={`l_p_${leg.id}`} type="number" value={leg.pax.toString()} onChange={(e: any) => updateTransferLeg(leg.id, 'pax', parseFloat(e.target.value))} />
                            <InputGroup label="Hora Inicio" name={`l_s_${leg.id}`} type="time" value={leg.startTime} onChange={(e: any) => updateTransferLeg(leg.id, 'startTime', e.target.value)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {showTour && (
                    <div className="space-y-6">
                      <div className="space-y-6 bg-[#f5f3ff] p-8 rounded-[32px] border border-purple-50 shadow-sm relative">
                        <SectionTitle label="Tour o Excursión" icon="fa-mountain" color="bg-purple-50 text-purple-600" />
                        <InputGroup label="Nombre Pasajero" name="departureName" value={formData.departureName} onChange={handleInputChange} />
                        <SelectGroup label="Tipo de Tour" name="tourType" value={formData.tourType || 'Tour Compartido'} onChange={handleInputChange} options={["Tour Compartido", "Tour Privado"]} />
                        <div className="relative">
                          <InputGroup label="Nombre del Tour" name="tourName" value={formData.tourName || ''} onChange={handleInputChange} placeholder="Escriba para buscar..." />
                          {tourSuggestions.index === 0 && tourSuggestions.list.length > 0 && (
                            <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-60 overflow-y-auto">
                              {tourSuggestions.list.map((tour, idx) => (
                                <button key={idx} onClick={() => handleTourSelect(tour, 0)} className="w-full text-left px-6 py-4 text-sm font-bold text-slate-700 hover:bg-purple-50 hover:text-purple-700 border-b border-gray-50 last:border-0">{tour}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        <InputGroup label="Hotel o punto de encuentro" name="originDeparture" value={formData.originDeparture} onChange={handleInputChange} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Pax" name="peopleCountDeparture" type="number" value={formData.peopleCountDeparture.toString()} onChange={handleInputChange} />
                          <InputGroup label="Pick up time" name="departureTimeHotel" type="time" value={formData.departureTimeHotel} onChange={handleInputChange} highlight />
                        </div>
                        <InputGroup label="Fecha" name="dateDeparture" type="date" value={formData.dateDeparture} onChange={handleInputChange} />
                        <button onClick={addTourLeg} className="mt-4 w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center text-xl shadow-lg"><i className="fas fa-plus"></i></button>
                      </div>

                      {formData.extraTours?.map((tour, idx) => (
                        <div key={tour.id} className="space-y-6 bg-purple-50/30 p-8 rounded-[32px] border border-purple-100 relative shadow-sm">
                          <button onClick={() => removeTourLeg(tour.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><i className="fas fa-trash"></i></button>
                          <h4 className="text-[10px] font-black uppercase text-purple-400 tracking-widest">Tour Adicional #{idx + 1}</h4>
                          <div className="relative">
                             <InputGroup label="Nombre del Tour" name={`t_n_${tour.id}`} value={tour.tourName} onChange={(e: any) => handleTourLegInputChange(tour.id, 'tourName', e.target.value)} />
                             {tourSuggestions.index === (idx + 1) && tourSuggestions.list.length > 0 && (
                                <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-40 overflow-y-auto">
                                  {tourSuggestions.list.map((t, tidx) => (
                                    <button key={tidx} onClick={() => handleTourSelect(t, idx + 1)} className="w-full text-left px-6 py-3 text-sm font-bold text-slate-700 hover:bg-purple-50">{t}</button>
                                  ))}
                                </div>
                             )}
                          </div>
                          <SelectGroup label="Tipo" name={`t_t_${tour.id}`} value={tour.tourType} onChange={(e: any) => handleTourLegInputChange(tour.id, 'tourType', e.target.value)} options={["Tour Compartido", "Tour Privado"]} />
                          <div className="grid grid-cols-2 gap-4">
                            <InputGroup label="Pax" name={`t_p_${tour.id}`} type="number" value={tour.peopleCountDeparture.toString()} onChange={(e: any) => handleTourLegInputChange(tour.id, 'peopleCountDeparture', parseFloat(e.target.value))} />
                            <InputGroup label="Hora" name={`t_h_${tour.id}`} type="time" value={tour.departureTimeHotel} onChange={(e: any) => handleTourLegInputChange(tour.id, 'departureTimeHotel', e.target.value)} />
                          </div>
                          <InputGroup label="Fecha" name={`t_d_${tour.id}`} type="date" value={tour.dateDeparture} onChange={(e: any) => handleTourLegInputChange(tour.id, 'dateDeparture', e.target.value)} />
                          <div className="flex flex-col group mt-4">
                            <label className="text-[10px] uppercase font-black text-purple-400 mb-2 tracking-widest pl-1">Observaciones del Tour #{idx + 2}</label>
                            <textarea 
                              name={`t_obs_${tour.id}`} 
                              value={tour.observations || ''} 
                              onChange={(e: any) => handleTourLegInputChange(tour.id, 'observations', e.target.value)}
                              rows={3}
                              className="border-2 border-purple-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-purple-500 outline-none transition-all shadow-sm"
                              placeholder="Notas u observaciones de este tour..."
                            />
                          </div>
                        </div>
                      ))}
                      
                      <div className="flex flex-col group mt-4">
                        <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones Generales</label>
                        <textarea 
                          name="observations" 
                          value={formData.observations} 
                          onChange={handleInputChange}
                          rows={4}
                          className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm"
                          placeholder="Notas adicionales..."
                        />
                      </div>
                    </div>
                  )}

                  {showCircuito && (
                    <div className="space-y-6">
                      <div className="space-y-6 bg-[#f0fdf4] p-8 rounded-[32px] border border-green-50 shadow-sm relative">
                        <SectionTitle label="Circuito" icon="fa-route" color="bg-green-50 text-green-600" />
                        <InputGroup label="Nombre Pasajero" name="departureName" value={formData.departureName} onChange={handleInputChange} />
                        <SelectGroup label="Tipo de Unidad" name="unitType" value={formData.unitType || '1 a 8 personas'} onChange={handleInputChange} options={["1 a 8 personas", "9 a 10 personas", "11 a 15 personas"]} />
                        <div className="grid grid-cols-2 gap-4">
                          <InputGroup label="Pax" name="peopleCountDeparture" type="number" value={formData.peopleCountDeparture.toString()} onChange={handleInputChange} />
                          <InputGroup label="Fecha Inicio" name="dateDeparture" type="date" value={formData.dateDeparture} onChange={handleInputChange} />
                        </div>
                        
                        <div className="flex flex-col group mt-4">
                          <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Incluye</label>
                          <textarea 
                            name="includedThings" 
                            value={formData.includedThings || ''} 
                            onChange={handleInputChange}
                            rows={3}
                            className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-green-500 outline-none transition-all shadow-sm"
                            placeholder="Ej: Transporte, Bebidas, etc."
                          />
                        </div>

                        <div className="flex flex-col group mt-4">
                          <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">No Incluye</label>
                          <textarea 
                            name="notIncludedThings" 
                            value={formData.notIncludedThings || ''} 
                            onChange={handleInputChange}
                            rows={3}
                            className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-red-500 outline-none transition-all shadow-sm"
                            placeholder="Ej: Propinas, Entradas, etc."
                          />
                        </div>

                        <div className="flex flex-col group mt-4">
                          <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones Generales Circuito</label>
                          <textarea 
                            name="observations" 
                            value={formData.observations} 
                            onChange={handleInputChange}
                            rows={3}
                            className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm"
                            placeholder="Notas adicionales..."
                          />
                        </div>

                        <button onClick={addCircuitoLeg} className="mt-4 w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center text-xl shadow-lg"><i className="fas fa-plus"></i></button>
                      </div>

                      {formData.circuitoLegs?.map((leg, idx) => (
                        <div key={leg.id} className="space-y-6 bg-green-50/30 p-8 rounded-[32px] border border-green-100 relative shadow-sm">
                          <button onClick={() => removeCircuitoLeg(leg.id)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500"><i className="fas fa-trash"></i></button>
                          <h4 className="text-[10px] font-black uppercase text-green-500 tracking-widest">Día #{idx + 1}</h4>
                          <div className="grid grid-cols-3 gap-4">
                            <InputGroup label="Fecha" name={`c_d_${leg.id}`} type="date" value={leg.date} onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'date', e.target.value)} />
                            <InputGroup label="Horario" name={`c_h_${leg.id}`} value={leg.schedule} onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'schedule', e.target.value)} placeholder="Ej: 08:00 - 18:00" />
                            <InputGroup label="Precio por Día" name={`c_pr_${leg.id}`} value={leg.pricePerDay || ''} onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'pricePerDay', e.target.value)} placeholder="Ej: $1,500 MXN" />
                          </div>
                          <div className="flex flex-col group mt-4">
                            <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Lugares / Puntos a visitar</label>
                            <textarea 
                              name={`c_p_${leg.id}`} 
                              value={leg.placesToVisit} 
                              onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'placesToVisit', e.target.value)}
                              rows={3}
                              className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-green-500 outline-none transition-all shadow-sm"
                              placeholder="Ej: Chichen Itza, Cenote Ik Kil..."
                            />
                          </div>
                          <div className="flex flex-col group mt-4">
                            <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Costo de Entradas (Aprox)</label>
                            <textarea 
                              name={`c_e_${leg.id}`} 
                              value={leg.entranceCosts} 
                              onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'entranceCosts', e.target.value)}
                              rows={2}
                              className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-green-500 outline-none transition-all shadow-sm"
                              placeholder="Ej: Chichen Itza $600 MXN..."
                            />
                          </div>
                          <div className="flex flex-col group mt-4">
                            <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">Observaciones del Día #{idx + 1}</label>
                            <textarea 
                              name={`c_obs_${leg.id}`} 
                              value={leg.observations || ''} 
                              onChange={(e: any) => handleCircuitoLegInputChange(leg.id, 'observations', e.target.value)}
                              rows={2}
                              className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-green-500 outline-none transition-all shadow-sm"
                              placeholder="Notas u observaciones de este día..."
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-12 pt-8 border-t border-gray-100 space-y-4">
                  {/* 1. PRIMARY UNIFIED MASTER ACTION BUTTON */}
                  <div>
                    <button 
                      type="button"
                      onClick={handleProcessAndGenerateVoucher} 
                      disabled={processingMaster}
                      className={`w-full py-5 px-6 ${
                        editingId 
                          ? 'bg-gradient-to-r from-amber-600 via-amber-700 to-emerald-700 hover:from-amber-700 hover:to-emerald-800' 
                          : 'bg-gradient-to-r from-[#0a305e] via-blue-900 to-emerald-700 hover:from-blue-950 hover:to-emerald-800'
                      } text-white rounded-2xl font-black uppercase text-xs sm:text-sm tracking-wide shadow-xl hover:shadow-2xl hover:scale-[1.006] active:scale-[0.99] transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60`}
                      title={editingId ? "Guardar cambios y reescribir reserva en memoria y Google Sheets" : "Guardar en memoria, registrar en Google Sheets y abrir voucher de confirmación"}
                    >
                      <i className={`fas ${processingMaster ? 'fa-spinner fa-spin text-emerald-300' : (editingId ? 'fa-pen-to-square text-amber-200' : 'fa-check-circle text-emerald-400')} text-base sm:text-lg`}></i>
                      <span>
                        {processingMaster 
                          ? (editingId ? 'REESCRIBIENDO Y SINCRONIZANDO...' : 'PROCESANDO Y SINCRONIZANDO...') 
                          : (editingId ? 'GUARDAR CAMBIOS Y REESCRIBIR RESERVA' : 'PROCESAR RESERVA Y GENERAR VOUCHER')}
                      </span>
                    </button>
                  </div>

                  {/* 2. SECONDARY BACKUP & CLEANUP */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <button 
                      type="button"
                      onClick={handleManualBackup} 
                      disabled={syncing}
                      className="py-3.5 px-5 bg-white hover:bg-emerald-50 text-emerald-800 border-2 border-emerald-200 hover:border-emerald-400 rounded-2xl font-black uppercase text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      title="Guardar o respaldar directamente en la hoja de Google Sheets vía webhook"
                    >
                      <i className={`fas ${syncing ? 'fa-spinner fa-spin text-emerald-600' : 'fa-cloud-upload-alt text-emerald-600'}`}></i>
                      <span>{syncing ? 'RESPALDANDO...' : 'RESPALDO MANUAL (SHEETS)'}</span>
                    </button>

                    <button 
                      type="button"
                      onClick={resetForm} 
                      className="py-3.5 px-5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border-2 border-slate-200 hover:border-rose-300 rounded-2xl font-black uppercase text-xs shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                      title="Limpiar todos los datos del formulario e iniciar nueva reserva"
                    >
                      <i className="fas fa-trash-alt text-slate-400 hover:text-rose-500"></i>
                      <span>LIMPIAR FORMULARIO</span>
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowSheetsScriptModal(true)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-1.5 px-3.5 rounded-xl border border-emerald-200/80 transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Ver y copiar el código de Google Apps Script para reescritura de reservas en Sheets"
                    >
                      <i className="fas fa-file-code text-xs text-emerald-600"></i>
                      <span>Configurar Script de Google Sheets (Reescritura de Reservas)</span>
                    </button>
                  </div>

                  {/* 3. DRIVER COMMUNICATIONS: ENVIAR LLEGADA A CHOFER, ENVIAR SALIDA A CHOFER */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <button 
                      type="button"
                      onClick={() => handleSendToDriver('arrival')} 
                      className="py-4 px-5 bg-[#25D366] hover:bg-[#1ebd5a] text-white rounded-2xl font-black uppercase text-xs shadow-md hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                      title="Enviar orden de llegada al chofer por WhatsApp con ruta y enlaces de estatus"
                    >
                      <i className="fab fa-whatsapp text-base"></i>
                      <i className="fas fa-plane-arrival text-xs text-white/90"></i>
                      <span>ENVIAR LLEGADA A CHOFER</span>
                    </button>

                    <button 
                      type="button"
                      onClick={() => handleSendToDriver('departure')} 
                      className="py-4 px-5 bg-[#128C7E] hover:bg-[#0e7064] text-white rounded-2xl font-black uppercase text-xs shadow-md hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                      title="Enviar orden de salida al chofer por WhatsApp con ruta y enlaces de estatus"
                    >
                      <i className="fab fa-whatsapp text-base"></i>
                      <i className="fas fa-plane-departure text-xs text-white/90"></i>
                      <span>ENVIAR SALIDA A CHOFER</span>
                    </button>
                  </div>

                  {editingId && (
                    <div className="pt-2 flex justify-center">
                      <button 
                        type="button"
                        onClick={cancelEdit} 
                        className="py-2.5 px-6 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold uppercase text-[11px] transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <i className="fas fa-times text-xs"></i>
                        <span>Cancelar Edición</span>
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {currentVoucher && (
                <div id="voucher-preview-section" className="animate-in fade-in slide-in-from-bottom-12 scroll-mt-6">
                  <VoucherPreview 
                    id="voucher-to-print"
                    reservation={currentVoucher} 
                    pdfSingleTourIndex={pdfSingleTourIndex}
                    language={previewLanguage}
                  />
                  <div className="flex justify-center flex-wrap gap-3 sm:gap-4 mt-8 px-4 max-w-2xl mx-auto no-print">
                    <button 
                      type="button"
                      onClick={() => handleEdit(currentVoucher)} 
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black uppercase text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <i className="fas fa-edit text-slate-500"></i> EDITAR
                    </button>

                    <button 
                      type="button"
                      onClick={() => handleShareOrDownload(currentVoucher, 'voucher-to-print', previewLanguage)} 
                      disabled={isExportingPDF}
                      className="flex-1 bg-[#0a305e] hover:bg-blue-900 text-white px-6 py-4 rounded-2xl font-black uppercase text-xs shadow-xl hover:shadow-2xl transition-all min-w-[220px] flex items-center justify-center gap-2.5 disabled:opacity-50 active:scale-[0.98] cursor-pointer"
                    >
                      <i className={`fas ${isExportingPDF ? 'fa-spinner fa-spin' : (isWebView ? 'fa-external-link-alt' : 'fa-share-nodes')} text-base text-blue-300`}></i>
                      <span>{isExportingPDF ? 'PREPARANDO VOUCHER...' : 'COMPARTIR / DESCARGAR VOUCHER'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header and Search for Reservations */}
              <div className="bg-white p-5 sm:p-6 rounded-[28px] sm:rounded-[36px] shadow-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-black uppercase text-slate-900 tracking-tight">
                      Reservaciones Guardadas
                    </h2>
                    <span className="bg-blue-50 text-blue-700 text-xs font-black px-2.5 py-1 rounded-xl border border-blue-100">
                      {reservations.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-bold uppercase mt-1">
                    Edita, reescribe o envía órdenes sin necesidad de girar la pantalla
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <i className="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input
                      type="text"
                      value={reservationSearch}
                      onChange={(e) => setReservationSearch(e.target.value)}
                      placeholder="Buscar por fecha (DD/MM/AAAA), hora (AM/PM), pasajero, rep, folio..."
                      className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-all"
                    />
                    {reservationSearch && (
                      <button
                        type="button"
                        onClick={() => setReservationSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
                        title="Limpiar búsqueda"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowSheetsScriptModal(true)}
                    className="py-2.5 px-3.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-2xl text-[11px] font-black uppercase transition-all shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
                    title="Ver o copiar el script de Google Sheets para reescritura automática"
                  >
                    <i className="fas fa-file-code text-xs text-emerald-600"></i>
                    <span className="hidden sm:inline">Script Sheets</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="py-2.5 px-4 bg-[#0a305e] hover:bg-blue-900 text-white rounded-2xl text-[11px] font-black uppercase transition-all shadow-md shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    <i className="fas fa-plus text-xs"></i>
                    <span className="hidden sm:inline">Nueva</span>
                  </button>
                </div>
              </div>

              {reservations.length === 0 ? (
                <div className="bg-white rounded-[32px] p-12 text-center border border-gray-100 shadow-xl max-w-md mx-auto">
                  <div className="w-16 h-16 mx-auto mb-4 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-sm">
                    <i className="fas fa-folder-open"></i>
                  </div>
                  <h3 className="font-black text-slate-800 uppercase text-base tracking-wide">No hay reservaciones guardadas</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase mt-1">Crea una nueva reserva en el formulario para gestionarla aquí</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="mt-6 py-3.5 px-6 bg-[#0a305e] hover:bg-blue-900 text-white rounded-2xl font-black uppercase text-xs transition-all shadow-md cursor-pointer"
                  >
                    Crear Nueva Reserva
                  </button>
                </div>
              ) : (
                <>
                  {/* MOBILE & DESKTOP: 100% Portrait-Friendly Card Grid (No horizontal rotation required) */}
                  {(() => {
                    const filtered = reservations.filter(r => {
                      if (!reservationSearch.trim()) return true;
                      const q = reservationSearch.toLowerCase().trim();
                      const dateService = getReservationServiceDate(r).toLowerCase();
                      const timeService = (r.departureTimeHotel || r.arrivalTime || r.time || '').toLowerCase();
                      const repVal = (r.rep || r.agency || r.company || '').toLowerCase();
                      const tourNameVal = (r.tourName || '').toLowerCase();
                      const destVal = (r.destination || r.arrivalDestination || r.departureDestination || '').toLowerCase();
                      const origVal = (r.origin || r.originDeparture || '').toLowerCase();
                      const passVal = (r.name || r.arrivalName || r.departureName || '').toLowerCase();
                      const codeVal = (r.reservationNo || r.id || '').toLowerCase();
                      const sTypeVal = (r.serviceType || '').toLowerCase();
                      const dateArrVal = (r.dateArrival || '').toLowerCase();
                      const dateDepVal = (r.dateDeparture || '').toLowerCase();
                      const longDate = formatDateToSpanishLong(dateService).toLowerCase();

                      return (
                        passVal.includes(q) ||
                        codeVal.includes(q) ||
                        sTypeVal.includes(q) ||
                        destVal.includes(q) ||
                        origVal.includes(q) ||
                        repVal.includes(q) ||
                        tourNameVal.includes(q) ||
                        dateService.includes(q) ||
                        dateArrVal.includes(q) ||
                        dateDepVal.includes(q) ||
                        longDate.includes(q) ||
                        timeService.includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm">
                          <p className="text-slate-500 font-bold text-sm">No se encontraron reservas con "{reservationSearch}"</p>
                          <button
                            type="button"
                            onClick={() => setReservationSearch('')}
                            className="mt-3 text-blue-600 font-black text-xs uppercase underline cursor-pointer"
                          >
                            Mostrar todas las reservaciones
                          </button>
                        </div>
                      );
                    }

                    // Ordenar todas las reservaciones estrictamente de forma cronológica por fecha y hora (de menor a mayor)
                    const sortedReservations = [...filtered].sort((a, b) => {
                      const dateA = getReservationServiceDate(a);
                      const dateB = getReservationServiceDate(b);
                      const timeA = a.departureTimeHotel || a.arrivalTime || a.time || '';
                      const timeB = b.departureTimeHotel || b.arrivalTime || b.time || '';
                      const tsA = parseMexicanDateToTimestamp(dateA, timeA);
                      const tsB = parseMexicanDateToTimestamp(dateB, timeB);
                      if (tsA !== tsB && tsA > 0 && tsB > 0) {
                        return tsA - tsB; // Ascendente: de menor a mayor
                      }
                      if (tsA > 0) return -1;
                      if (tsB > 0) return 1;
                      return (a.createdAt || '').localeCompare(b.createdAt || '');
                    });

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {sortedReservations.map(res => {
                          const depMxn = Number(res.depositMxn || 0);
                          const payMxn = Number(res.toPayMxn || 0);
                          const depUsd = Number(res.depositUsd || 0);
                          const payUsd = Number(res.toPayUsd || 0);
                          const hasMxn = depMxn > 0 || payMxn > 0;
                          const hasUsd = depUsd > 0 || payUsd > 0;

                          const isTour = /tour/i.test(res.serviceType || '') || /excursi/i.test(res.serviceType || '');
                          const isSalida = /salida/i.test(res.serviceType || '') && !/llegada/i.test(res.serviceType || '');
                          const isTraslado = /traslado/i.test(res.serviceType || '');
                          const isCircuito = /circuito/i.test(res.serviceType || '');
                          const isArrivalOnly = /solo llegada/i.test(res.serviceType || '');

                          return (
                            <div 
                              key={res.id} 
                              className="bg-white rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-100 hover:border-blue-200 transition-all space-y-4 flex flex-col justify-between"
                            >
                              <div className="space-y-3.5">
                                {/* Card Header: Folio, Service & Prominent EDITAR Button */}
                                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-black text-sm sm:text-base text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl">
                                      #{res.reservationNo}
                                    </span>
                                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                      {res.serviceType}
                                    </span>
                                    {(res.rep || res.agency || res.company) && (
                                      <span className="px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center">
                                        <i className="fas fa-user-tie text-[9px] mr-1 opacity-70"></i>
                                        REP: {res.rep || res.agency || res.company}
                                      </span>
                                    )}
                                  </div>

                                  {/* Prominent Header EDITAR button: Always accessible without scrolling */}
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(res)}
                                    className="py-1.5 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-[11px] font-black uppercase flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer shrink-0"
                                    title="Editar reserva y recargarla en el formulario para reescribirla"
                                  >
                                    <i className="fas fa-edit text-xs"></i>
                                    <span>EDITAR</span>
                                  </button>
                                </div>

                                {/* Passenger Titular & Pax */}
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider">Pasajero Titular</span>
                                    <span className="font-black text-base text-slate-900 uppercase leading-snug">{res.name}</span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="text-[10px] uppercase font-black text-slate-400 block tracking-wider">Pax</span>
                                    <span className="font-black text-xs text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg inline-block">
                                      {res.peopleCount || 1} PAX
                                    </span>
                                  </div>
                                </div>

                                {/* Route, Dates & Times */}
                                <div className="bg-slate-50 p-3 sm:p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
                                  {(res.origin || res.destination || res.arrivalDestination || res.originDeparture) && (
                                    <div className="flex items-start gap-2 text-slate-700">
                                      <i className="fas fa-map-marker-alt text-blue-500 text-xs mt-0.5 shrink-0"></i>
                                      <div className="leading-snug">
                                        <span className="font-bold text-slate-500 text-[10px] uppercase mr-1">Ruta:</span>
                                        <span className="font-bold">{res.origin || res.originDeparture || 'Aeropuerto'}</span>
                                        <span className="mx-1 text-slate-400">➔</span>
                                        <span className="font-bold">{res.destination || res.arrivalDestination || res.departureDestination || 'Hotel / Destino'}</span>
                                      </div>
                                    </div>
                                  )}

                                  {/* Fechas según el tipo de servicio */}
                                  {isTour ? (
                                    <div className="flex items-center gap-2 text-purple-700 flex-wrap">
                                      <i className="fas fa-mountain text-purple-500 text-xs shrink-0"></i>
                                      <span className="font-bold text-slate-500 text-[10px] uppercase">Excursión:</span>
                                      <span className="font-bold">{res.tourName || 'Tour'}</span>
                                      <span className="text-slate-300">|</span>
                                      <span className="font-bold">{res.dateDeparture || res.date}</span>
                                      {res.departureTimeHotel && <span className="text-slate-600 font-medium">(Pick-up {res.departureTimeHotel} hrs)</span>}
                                    </div>
                                  ) : (isSalida || isTraslado) ? (
                                    <div className="flex items-center gap-2 text-slate-700 flex-wrap">
                                      <i className="fas fa-plane-departure text-teal-500 text-xs shrink-0"></i>
                                      <span className="font-bold text-slate-500 text-[10px] uppercase">{isTraslado ? 'Traslado:' : 'Salida:'}</span>
                                      <span className="font-bold">{res.dateDeparture || res.date}</span>
                                      {res.departureTimeHotel && <span className="text-slate-600 font-medium">(Pick-up {res.departureTimeHotel} hrs)</span>}
                                      {res.departureTimeFlight && (
                                        <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-teal-200/60">
                                          Vuelo: {res.departureTimeFlight}
                                        </span>
                                      )}
                                    </div>
                                  ) : isArrivalOnly ? (
                                    <div className="flex items-center gap-2 text-slate-700 flex-wrap">
                                      <i className="fas fa-plane-arrival text-emerald-500 text-xs shrink-0"></i>
                                      <span className="font-bold text-slate-500 text-[10px] uppercase">Llegada:</span>
                                      <span className="font-bold">{res.dateArrival || res.date}</span>
                                      {res.arrivalTime && <span className="text-slate-600 font-medium">({res.arrivalTime} hrs)</span>}
                                      {res.flightNoArrival && (
                                        <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200/60">
                                          Vuelo: {res.flightNoArrival}
                                        </span>
                                      )}
                                    </div>
                                  ) : isCircuito ? (
                                    <div className="flex items-center gap-2 text-slate-700 flex-wrap">
                                      <i className="fas fa-route text-blue-500 text-xs shrink-0"></i>
                                      <span className="font-bold text-slate-500 text-[10px] uppercase">Circuito:</span>
                                      <span className="font-bold">{res.circuitoLegs?.[0]?.date || res.dateArrival || res.date}</span>
                                    </div>
                                  ) : (
                                    <>
                                      {res.dateArrival && (
                                        <div className="flex items-center gap-2 text-slate-700 flex-wrap">
                                          <i className="fas fa-plane-arrival text-emerald-500 text-xs shrink-0"></i>
                                          <span className="font-bold text-slate-500 text-[10px] uppercase">Llegada:</span>
                                          <span className="font-bold">{res.dateArrival}</span>
                                          {res.arrivalTime && <span className="text-slate-600 font-medium">({res.arrivalTime} hrs)</span>}
                                          {res.flightNoArrival && (
                                            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200/60">
                                              Vuelo: {res.flightNoArrival}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {res.dateDeparture && (
                                        <div className="flex items-center gap-2 text-slate-700 flex-wrap">
                                          <i className="fas fa-plane-departure text-teal-500 text-xs shrink-0"></i>
                                          <span className="font-bold text-slate-500 text-[10px] uppercase">Salida:</span>
                                          <span className="font-bold">{res.dateDeparture}</span>
                                          {res.departureTimeHotel && <span className="text-slate-600 font-medium">(Pick-up {res.departureTimeHotel} hrs)</span>}
                                          {res.departureTimeFlight && (
                                            <span className="bg-teal-50 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-teal-200/60">
                                              Vuelo: {res.departureTimeFlight}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Financial Details: Depósito, A Pagar y Total */}
                                <div className="bg-amber-50/70 p-3 sm:p-3.5 rounded-2xl border border-amber-200/70 space-y-2">
                                  <div className="flex items-center justify-between text-xs border-b border-amber-200/60 pb-1">
                                    <span className="text-[10px] font-black uppercase text-amber-900 flex items-center gap-1.5">
                                      <i className="fas fa-wallet text-amber-600"></i> Desglose de Precios / Saldos:
                                    </span>
                                    <span className="text-[10px] text-amber-700 font-bold italic">
                                      {payMxn > 0 || payUsd > 0 ? 'Cobro directo al cliente' : 'Servicio liquidado'}
                                    </span>
                                  </div>

                                  {hasMxn || hasUsd ? (
                                    <div className="flex flex-col sm:flex-row flex-wrap gap-2 text-xs">
                                      {hasMxn && (
                                        <div className="bg-white px-2.5 py-1.5 rounded-xl border border-amber-200 shadow-2xs flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-1 py-0.5 rounded">MXN</span>
                                          <span className="text-slate-600 text-[11px]">Depósito: <strong className="text-slate-900">${depMxn}</strong></span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-600 text-[11px]">A Pagar: <strong className="text-[#f05a28] font-black">${payMxn}</strong></span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-700 text-[11px] font-bold">Total: ${depMxn + payMxn}</span>
                                        </div>
                                      )}
                                      {hasUsd && (
                                        <div className="bg-white px-2.5 py-1.5 rounded-xl border border-emerald-200 shadow-2xs flex items-center gap-1.5 flex-wrap">
                                          <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded">USD</span>
                                          <span className="text-slate-600 text-[11px]">Depósito: <strong className="text-slate-900">${depUsd}</strong></span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-600 text-[11px]">A Pagar: <strong className="text-[#f05a28] font-black">${payUsd}</strong></span>
                                          <span className="text-slate-300">|</span>
                                          <span className="text-slate-700 text-[11px] font-bold">Total: ${depUsd + payUsd}</span>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-slate-600 font-medium">
                                      {res.amount && res.amount !== '$0' ? res.amount : 'Sin saldos registrados ($0)'}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Card Action Buttons: Vertical / Mobile friendly */}
                              <div className="pt-3 border-t border-slate-100 mt-2">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(res)}
                                    className="py-3 px-2 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
                                    title="Editar reserva y recargarla en el formulario para reescribirla"
                                  >
                                    <i className="fas fa-edit text-xs"></i>
                                    <span>EDITAR</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCurrentVoucher(res);
                                      setShowVoucherModal({ show: true, reservation: res });
                                    }}
                                    className="py-3 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                    title="Ver voucher digital"
                                  >
                                    <i className="fas fa-file-invoice text-xs"></i>
                                    <span>VOUCHER</span>
                                  </button>

                                  {(res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Llegada") && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendToDriver('arrival', res)}
                                      className="py-3 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                      title="Enviar orden de llegada al chofer por WhatsApp"
                                    >
                                      <i className="fab fa-whatsapp text-sm text-emerald-600"></i>
                                      <span>LLEGADA</span>
                                    </button>
                                  )}

                                  {(res.serviceType === "Llegada y Salida" || res.serviceType === "Solo Salida" || res.serviceType === "Solo Traslado" || res.serviceType === "Tour o Excursión" || res.serviceType === "Circuito") && (
                                    <button
                                      type="button"
                                      onClick={() => handleSendToDriver('departure', res)}
                                      className="py-3 px-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                      title="Enviar orden de salida al chofer por WhatsApp"
                                    >
                                      <i className="fab fa-whatsapp text-sm text-teal-600"></i>
                                      <span>SALIDA</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteReservation(res.id)}
                                    className="py-3 px-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl text-[11px] font-black uppercase flex items-center justify-center gap-1 shadow-2xs active:scale-95 transition-all cursor-pointer"
                                    title="Eliminar esta reservación duplicada"
                                  >
                                    <i className="fas fa-trash-alt text-xs text-rose-500"></i>
                                    <span>BORRAR</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </main>
      </div>

      <aside className="hidden xl:flex w-80 flex-col gap-8 p-10 bg-white border-l border-slate-100 shadow-2xl">
        <h3 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2"><i className="fab fa-whatsapp text-green-500"></i> Envíos</h3>
        <div className="space-y-6 mt-4">
          <WhatsAppBtn icon="fa-taxi" color="bg-[#25D366]" label="Al Chofer" onClick={() => triggerWhatsAppModal('driver')} />
          <WhatsAppBtn icon="fa-user-tie" color="bg-[#0a305e]" label="Al Agente Staff" onClick={() => triggerWhatsAppModal('staff')} />
          <WhatsAppBtn icon="fa-headset" color="bg-[#f05a28]" label="Al Cliente" onClick={() => triggerWhatsAppModal('customer')} />
        </div>
      </aside>
    </div>
  );
};

const SectionTitle: React.FC<{ label: string; icon: string; color: string }> = ({ label, icon, color }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shadow-sm`}><i className={`fas ${icon}`}></i></div>
    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">{label}</h3>
  </div>
);

const InputGroup: React.FC<{ 
  label: string; 
  name: string; 
  type?: string; 
  value: string; 
  onChange?: any; 
  placeholder?: string; 
  highlight?: boolean 
}> = ({ label, name, type = 'text', value, onChange, placeholder, highlight = false }) => {
  const dateInputRef = React.useRef<HTMLInputElement | null>(null);
  const [manualMode, setManualMode] = React.useState(false);
  const [manualText, setManualText] = React.useState(() => toMexicanDateFormat(value) || value || '');

  React.useEffect(() => {
    if (type === 'date') {
      setManualText(toMexicanDateFormat(value) || value || '');
    }
  }, [value, type]);

  if (type === 'date') {
    const isoVal = toISOFormat(value);
    const mexicanFormatted = toMexicanDateFormat(value);
    const spanishLong = formatDateToSpanishLong(value);

    // Native Date Picker Change
    const handleNativeDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawIso = e.target.value;
      if (rawIso) {
        const mex = toMexicanDateFormat(rawIso);
        setManualText(mex);
        onChange?.({ target: { name, value: mex } });
      } else {
        setManualText('');
        onChange?.({ target: { name, value: '' } });
      }
    };

    // Manual Text Typing Change (allows typing without reformatting interference)
    const handleManualTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setManualText(val);
      onChange?.({ target: { name, value: val } });
    };

    // On manual blur, format to standard Mexican DD/MM/YYYY
    const handleManualBlur = () => {
      if (!manualText) return;
      const formatted = toMexicanDateFormat(manualText);
      if (formatted && formatted !== manualText) {
        setManualText(formatted);
        onChange?.({ target: { name, value: formatted } });
      }
    };

    // Quick Date setter: Today (0), Tomorrow (+1)
    const setQuickDate = (offsetDays: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      const iso = d.toISOString().split('T')[0];
      const mex = toMexicanDateFormat(iso);
      setManualText(mex);
      onChange?.({ target: { name, value: mex } });
    };

    const openCalendarPicker = (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (dateInputRef.current) {
        try {
          if (typeof (dateInputRef.current as any).showPicker === 'function') {
            (dateInputRef.current as any).showPicker();
          } else {
            dateInputRef.current.focus();
          }
        } catch {
          dateInputRef.current.focus();
        }
      }
    };

    return (
      <div className="flex flex-col group relative">
        <div className="flex justify-between items-center mb-1.5 pl-1 flex-wrap gap-1">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest">{label}</label>
            <span className="text-[9px] font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              DD/MM/AAAA
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setQuickDate(0)}
              className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 cursor-pointer"
              title="Poner fecha de Hoy"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => setQuickDate(1)}
              className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200 cursor-pointer"
              title="Poner fecha de Mañana"
            >
              Mañana
            </button>
            <button
              type="button"
              onClick={() => setManualMode(!manualMode)}
              className="text-[9px] font-black text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded-md transition-colors border border-slate-200 cursor-pointer"
              title={manualMode ? "Cambiar a selector de calendario" : "Escribir fecha manualmente como texto"}
            >
              <i className={`fas ${manualMode ? 'fa-calendar-alt text-blue-600' : 'fa-pen'} mr-1`}></i>
              {manualMode ? 'Calendario' : 'Texto'}
            </button>
          </div>
        </div>

        <div className="relative flex items-center">
          {manualMode ? (
            <input
              type="text"
              name={name}
              value={manualText}
              onChange={handleManualTextChange}
              onBlur={handleManualBlur}
              placeholder={placeholder || "DD/MM/AAAA (ej. 25/10/2026)"}
              maxLength={10}
              className={`w-full border-2 border-blue-400 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-600 outline-none transition-all shadow-sm ${highlight ? 'text-orange-600 border-orange-50' : ''}`}
            />
          ) : (
            <div className="relative w-full flex items-center">
              <input
                ref={dateInputRef}
                type="date"
                name={name}
                value={isoVal}
                onChange={handleNativeDateChange}
                className={`w-full border-2 border-gray-100 rounded-2xl pl-5 pr-12 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm cursor-pointer ${highlight ? 'text-orange-600 border-orange-50' : ''}`}
              />
              <button
                type="button"
                onClick={openCalendarPicker}
                title="Abrir calendario"
                className="absolute right-3.5 w-8 h-8 rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center transition-all cursor-pointer pointer-events-auto"
              >
                <i className="far fa-calendar-alt text-sm"></i>
              </button>
            </div>
          )}
        </div>

        {value && spanishLong !== '---' && (
          <div className="mt-1 pl-1 text-[10px] font-semibold text-slate-500 flex items-center gap-1.5">
            <i className="far fa-calendar-check text-emerald-500"></i>
            <span>{spanishLong}</span>
            {mexicanFormatted && (
              <span className="font-mono font-bold text-slate-600">({mexicanFormatted})</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col group">
      <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">{label}</label>
      <input 
        type={type} 
        name={name} 
        value={value} 
        onChange={onChange} 
        placeholder={placeholder} 
        className={`border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm ${highlight ? 'text-orange-600 border-orange-50' : ''}`} 
      />
    </div>
  );
};

const SelectGroup: React.FC<{ label: string; name: string; value: string; onChange: any; options: string[] }> = ({ label, name, value, onChange, options }) => (
  <div className="flex flex-col group">
    <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">{label}</label>
    <select name={name} value={value} onChange={onChange} className="border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm appearance-none cursor-pointer">
      {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

const WhatsAppBtn: React.FC<{ icon: string; color: string; label: string; onClick: () => void }> = ({ icon, color, label, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center group w-full">
    <div className={`w-full h-20 ${color} text-white rounded-[32px] flex flex-col items-center justify-center shadow-xl transform group-hover:scale-105 transition-all duration-300`}>
      <i className={`fas ${icon} text-2xl mb-1`}></i>
      <span className="text-[9px] font-black uppercase opacity-80">{label}</span>
    </div>
  </button>
);

export default App;

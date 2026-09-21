
import React, { useState, useEffect } from 'react';
import { Reservation, TransferLeg, TourLeg, CircuitoLeg } from './types';
import { CONTACTS, COMPANY_EMAIL, SHEET_NAME, Logo, TOUR_LIST } from './constants';
import { getWhatsAppLink, generateWhatsAppMessage } from './utils';
import VoucherPreview from './components/VoucherPreview';

const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mKo7CYV3Wf1LmuuslP0DmV9UTUFvGvE1JKFQihqFLvE/edit?gid=0#gid=0";

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [currentVoucher, setCurrentVoucher] = useState<Reservation | null>(null);
  const [syncing, setSyncing] = useState(false);
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
    dateArrival: new Date().toISOString().split('T')[0],
    dateDeparture: new Date().toISOString().split('T')[0],
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

  useEffect(() => {
    const saved = localStorage.getItem('qt_reservations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setReservations(parsed);
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
      date: formData.dateArrival || new Date().toISOString().split('T')[0],
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
      date: new Date().toISOString().split('T')[0]
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

  const handleSave = (andExportPdf: boolean = false) => {
    let resolvedName = formData.name;
    let resolvedPeopleCount = formData.peopleCount;

    if (formData.serviceType === "Llegada y Salida") {
      resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 0;
    } else if (formData.serviceType === "Solo Llegada") {
      resolvedName = formData.arrivalName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 0;
    } else {
      // Solo Salida, Solo Traslado, Tour o Excursión, Circuito
      resolvedName = formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 0;
    }

    const finalData = { 
      ...formData, 
      name: resolvedName,
      peopleCount: resolvedPeopleCount
    };

    let updated: Reservation[];
    let savedRes: Reservation;

    if (editingId) {
      const existingRes = reservations.find(r => String(r.id) === String(editingId));
      savedRes = { 
        ...finalData, 
        id: String(editingId), 
        createdAt: existingRes?.createdAt || new Date().toISOString() 
      } as Reservation;

      updated = reservations.map(res => {
        if (String(res.id) === String(editingId)) {
          return savedRes;
        }
        return res;
      });
      showUIMessage(`✅ Reserva ${formData.reservationNo} actualizada con éxito.`);
    } else {
      const newRes: Reservation = {
        ...finalData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
      } as Reservation;
      savedRes = newRes;
      updated = [newRes, ...reservations];
      showUIMessage(`✅ Reserva ${newRes.reservationNo} guardada.`);
    }

    setReservations(updated);
    localStorage.setItem('qt_reservations', JSON.stringify(updated));
    localStorage.removeItem('qt_draft_voucher');
    setLastAutoSaved(null);
    setCurrentVoucher(savedRes);
    
    setEditingId(null);
    setFormData({
      ...initialFormState,
      reservationNo: generateNewId()
    });

    if (andExportPdf) {
      setShowVoucherModal({ show: true, reservation: savedRes });
    } else {
      setTimeout(() => {
        const previewEl = document.getElementById('voucher-preview-section');
        if (previewEl) {
          previewEl.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    localStorage.removeItem('qt_draft_voucher');
    setLastAutoSaved(null);
    setFormData({
      ...initialFormState,
      reservationNo: generateNewId()
    });
    showUIMessage('ℹ️ Edición cancelada.');
  };

  const handleEdit = (res: Reservation) => {
    setEditingId(res.id);
    const { id, createdAt, ...dataToEdit } = res;
    // Merge with initial state to ensure all fields exist
    setFormData({
      ...initialFormState,
      ...dataToEdit
    });
    setActiveTab('create');
    setCurrentVoucher(res);
    setPreviewLanguage('es');
    showUIMessage(`✏️ Editando reserva ${res.reservationNo}`);
    // Scroll to top to see the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAIParsing = async () => {
    if (!aiInputText.trim()) return;
    setIsParsingAI(true);
    try {
      const response = await fetch('/api/parse-reservation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: aiInputText.trim() }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al procesar la reserva con IA');
      }

      const parsedData = result.data;
      if (parsedData && typeof parsedData === 'object') {
        setFormData(prev => {
          const newData = { ...prev };
          Object.keys(parsedData).forEach(key => {
            if (parsedData[key] !== undefined && parsedData[key] !== null && parsedData[key] !== '') {
              (newData as any)[key] = parsedData[key];
            }
          });
          
          if (parsedData.name) {
            if (!newData.arrivalName) newData.arrivalName = parsedData.name;
            if (!newData.departureName) newData.departureName = parsedData.name;
          }
          if (parsedData.peopleCount) {
            if (newData.peopleCountArrival === 1) newData.peopleCountArrival = parsedData.peopleCount;
            if (newData.peopleCountDeparture === 1) newData.peopleCountDeparture = parsedData.peopleCount;
          }

          return newData;
        });
        showUIMessage("✅ Datos extraídos y autocompletados con éxito.");
        setAiInputText('');
      } else {
        showUIMessage("⚠️ No se pudieron extraer datos del texto.");
      }
    } catch (error: any) {
      console.error("Error parsing AI:", error);
      showUIMessage(`❌ ${error?.message || "Error al analizar el texto. Intente de nuevo."}`);
    } finally {
      setIsParsingAI(false);
    }
  };

  const handleSyncToSheets = async () => {
    let resolvedName = formData.name;
    let resolvedPeopleCount = formData.peopleCount;

    if (formData.serviceType === "Llegada y Salida") {
      resolvedName = formData.arrivalName || formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCountDeparture || formData.peopleCount || 0;
    } else if (formData.serviceType === "Solo Llegada") {
      resolvedName = formData.arrivalName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountArrival || formData.peopleCount || 0;
    } else {
      // Solo Salida, Solo Traslado, Tour o Excursión, Circuito
      resolvedName = formData.departureName || formData.name || '';
      resolvedPeopleCount = formData.peopleCountDeparture || formData.peopleCount || 0;
    }

    const data = currentVoucher || {
        ...formData, 
        name: resolvedName,
        peopleCount: resolvedPeopleCount,
        createdAt: new Date().toISOString()
    };
    
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    };

    const rows: string[] = [];
    const balanceStr = `MXN-Dep: $${data.depositMxn} Pay: $${data.toPayMxn} | USD-Dep: $${data.depositUsd} Pay: $${data.toPayUsd}`;

    const addRow = (
        date: string, 
        time: string, 
        service: string, 
        origin: string, 
        dest: string, 
        pax: number, 
        name: string, 
        flight: string, 
        bal: string,
        idSuffix: string = ''
    ) => {
        rows.push([
            data.reservationNo + idSuffix,
            formatDate(date),
            time || '-',
            service,
            origin || '-',
            dest || '-',
            pax,
            name,
            flight || '-',
            bal,
            "", // CHOFER
            "Quick Travel", // COMPAÑÍA
            "" // VENDEDOR
        ].join('\t'));
    };

    if (data.serviceType === "Llegada y Salida") {
        addRow(data.dateArrival, data.arrivalTime, "Llegada", data.origin, data.arrivalDestination, data.peopleCountArrival, data.arrivalName || data.name, `${data.airlineArrival || ''} ${data.flightNoArrival || ''}`.trim(), balanceStr);
        addRow(data.dateDeparture, data.departureTimeHotel, "Salida", data.originDeparture, data.departureDestination, data.peopleCountDeparture, data.departureName || data.name, data.departureTimeFlight ? `Vuelo ${data.departureTimeFlight}` : '', "0");
    } else if (data.serviceType === "Solo Llegada") {
        addRow(data.dateArrival, data.arrivalTime, "Llegada", data.origin, data.arrivalDestination, data.peopleCountArrival, data.arrivalName || data.name, `${data.airlineArrival || ''} ${data.flightNoArrival || ''}`.trim(), balanceStr);
    } else if (data.serviceType === "Solo Salida") {
        addRow(data.dateDeparture, data.departureTimeHotel, "Salida", data.originDeparture, data.departureDestination, data.peopleCountDeparture, data.departureName || data.name, data.departureTimeFlight ? `Vuelo ${data.departureTimeFlight}` : '', balanceStr);
    } else if (data.serviceType === "Solo Traslado") {
        addRow(data.dateDeparture, data.departureTimeHotel, `Traslado (${data.transferSubtype})`, data.originDeparture, data.departureDestination, data.peopleCountDeparture, data.departureName || data.name, "", balanceStr);
        if (data.transferSubtype === "Traslado Múltiple" && data.extraLegs) {
            data.extraLegs.forEach((leg, i) => { addRow(leg.date, leg.startTime, "Traslado Extra", leg.origin, leg.destination, leg.pax, data.departureName || data.name, "", "0", `-L${i+1}`); });
        }
    } else if (data.serviceType === "Tour o Excursión") {
        addRow(data.dateDeparture, data.departureTimeHotel, `Tour: ${data.tourName}`, data.originDeparture, "-", data.peopleCountDeparture, data.departureName || data.name, "", balanceStr);
         if (data.extraTours) {
            data.extraTours.forEach((tour, i) => { addRow(tour.dateDeparture, tour.departureTimeHotel, `Tour: ${tour.tourName}`, tour.originDeparture, "-", tour.peopleCountDeparture, data.departureName || data.name, "", "0", `-T${i+1}`); });
        }
    } else if (data.serviceType === "Circuito") {
        addRow(data.dateDeparture, "-", `Circuito: ${data.unitType}`, data.originDeparture, "-", data.peopleCountDeparture, data.departureName || data.name, "", balanceStr);
        if (data.circuitoLegs) {
            data.circuitoLegs.forEach((leg, i) => { addRow(leg.date, leg.schedule, `Día ${i+1}: ${leg.placesToVisit}`, "-", "-", data.peopleCountDeparture, data.departureName || data.name, "", "0", `-C${i+1}`); });
        }
    }

    const tsv = rows.join('\n');

    try {
      await navigator.clipboard.writeText(tsv);
      setSyncing(true);
      showUIMessage(`📋 Copiado! Pega (Ctrl+V) en la hoja.`);
      setTimeout(() => { setSyncing(false); window.location.href = GOOGLE_SHEET_URL; }, 1000);
    } catch (err) {
      window.location.href = GOOGLE_SHEET_URL;
      showUIMessage(`⚠️ No se pudo copiar. Abriendo hoja.`);
    }
  };

  const handlePrintVoucher = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
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

  const confirmAndSendWhatsApp = () => {
    const voucher = currentVoucher || formData;
    const message = generateWhatsAppMessage(voucher as Reservation);
    window.location.href = getWhatsAppLink(showWSModal.number, message);
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
              <button 
                onClick={() => setShowVoucherModal({ show: false, reservation: null })} 
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-white transition-all"
                title="Cerrar"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            
            <div className="p-3 sm:p-6 md:p-8 overflow-y-auto bg-gray-50 flex-1">
              <VoucherPreview 
                id="voucher-modal-print"
                reservation={showVoucherModal.reservation} 
                pdfSingleTourIndex={pdfSingleTourIndex}
                language={previewLanguage}
              />
            </div>

            <div className="p-4 sm:p-6 bg-white border-t border-gray-100 flex flex-col sm:flex-row gap-3 sm:gap-4 no-print shrink-0">
              <button 
                onClick={() => {
                  handleEdit(showVoucherModal.reservation!);
                  setShowVoucherModal({ show: false, reservation: null });
                }} 
                className="flex-1 py-4 px-6 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black uppercase text-xs sm:text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <i className="fas fa-edit text-base"></i> EDITAR
              </button>
              
              <button 
                onClick={handlePrintVoucher} 
                className="flex-[2] py-4 px-6 bg-[#0a305e] hover:bg-blue-900 text-white rounded-2xl font-black uppercase text-xs sm:text-sm shadow-xl hover:shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
              >
                <i className="fas fa-print text-lg text-emerald-400"></i>
                <span>IMPRIMIR / GUARDAR COMO PDF</span>
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
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center z-50">
          <Logo height="h-12" />
          <nav className="flex bg-gray-100 p-1.5 rounded-2xl">
            <button onClick={() => { setActiveTab('create'); }} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'create' ? 'bg-white text-[#0a305e]' : 'text-gray-400'}`}>Nuevo Voucher</button>
            <button onClick={() => setActiveTab('history')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase ${activeTab === 'history' ? 'bg-white text-[#0a305e]' : 'text-gray-400'}`}>Reservaciones</button>
          </nav>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10">
          {activeTab === 'create' ? (
            <div className="max-w-6xl mx-auto space-y-12">
              <section className="bg-white p-8 md:p-12 rounded-[40px] shadow-2xl border border-gray-100">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-black uppercase">
                      {editingId ? 'Editar Reservación' : 'Registro de Servicio'}
                    </h2>
                    {editingId ? (
                      <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-[10px] font-black border border-amber-200/80 shadow-sm animate-in fade-in">
                        <i className="fas fa-edit text-amber-600"></i> Modo Edición
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
                        onClick={cancelEdit}
                        title="Cancelar edición y volver a nuevo registro"
                        className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black uppercase text-[10px] transition-all flex items-center gap-1.5"
                      >
                        <i className="fas fa-times text-xs"></i> Cancelar Edición
                      </button>
                    ) : (
                      <button 
                        onClick={resetForm}
                        title="Limpiar campos y borrar borrador"
                        className="px-4 py-2.5 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 rounded-2xl font-black uppercase text-[10px] transition-all flex items-center gap-1.5"
                      >
                        <i className="fas fa-trash-alt text-xs"></i> Limpiar Formulario
                      </button>
                    )}
                    <div className="bg-blue-50 px-6 py-3 rounded-2xl font-mono text-lg font-black text-blue-600">
                      {formData.reservationNo}
                    </div>
                  </div>
                </div>

                {editingId && (
                  <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4 text-amber-900 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold">
                        <i className="fas fa-pen text-sm"></i>
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide">Editando la Reserva #{formData.reservationNo}</p>
                        <p className="text-[11px] text-amber-700">Realiza tus modificaciones y haz clic en "Actualizar y Descargar PDF" o "Actualizar Reserva".</p>
                      </div>
                    </div>
                    <button 
                      onClick={cancelEdit}
                      className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-xl text-[10px] font-black uppercase hover:bg-amber-100 transition-all"
                    >
                      Descartar cambios
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

                <div className="mt-12 pt-8 border-t border-gray-100 flex flex-wrap gap-4">
                  {editingId ? (
                    <>
                      <button 
                        onClick={() => handleSave(true)} 
                        className="flex-1 py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase text-[11px] shadow-xl hover:bg-emerald-700 hover:scale-[1.01] transition-all flex items-center justify-center gap-2 min-w-[200px]"
                      >
                        <i className="fas fa-file-invoice"></i> Actualizar y Ver Voucher
                      </button>
                      <button 
                        onClick={() => handleSave(false)} 
                        className="flex-1 py-5 bg-[#0a305e] text-white rounded-[24px] font-black uppercase text-[11px] shadow-xl hover:scale-[1.01] transition-all min-w-[160px]"
                      >
                        Actualizar Reserva
                      </button>
                      <button 
                        onClick={cancelEdit} 
                        className="px-6 py-5 bg-gray-100 text-gray-600 rounded-[24px] font-black uppercase text-[11px] hover:bg-gray-200 transition-all"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => handleSave(false)} className="flex-1 py-5 bg-[#0a305e] text-white rounded-[24px] font-black uppercase text-[11px] shadow-xl hover:scale-[1.01] transition-all">
                      Guardar y Generar
                    </button>
                  )}
                  <button onClick={handleSyncToSheets} className="px-8 py-5 bg-[#34a853] text-white rounded-[24px] font-black uppercase text-[11px] shadow-xl flex items-center gap-2">
                    <i className="fas fa-table"></i> {syncing ? 'Sincronizando...' : 'Sheets'}
                  </button>
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
                  <div className="flex justify-center flex-wrap gap-4 mt-12 px-4 max-w-2xl mx-auto no-print">
                    <button 
                      onClick={() => handleEdit(currentVoucher)} 
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white px-6 py-4 rounded-[24px] font-black uppercase text-xs shadow-lg transition-all min-w-[120px] flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <i className="fas fa-edit"></i> EDITAR
                    </button>
                    <button 
                      onClick={handlePrintVoucher} 
                      className="flex-[2] bg-[#0a305e] hover:bg-blue-900 text-white px-6 py-4 rounded-[24px] font-black uppercase text-xs shadow-xl transition-all min-w-[220px] flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                      <i className="fas fa-print text-emerald-400 text-base"></i>
                      <span>IMPRIMIR / GUARDAR COMO PDF</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-6xl mx-auto">
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-gray-100">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black tracking-widest border-b border-gray-100">
                    <tr>
                      <th className="px-10 py-6">ID</th>
                      <th className="px-10 py-6">Pasajero</th>
                      <th className="px-10 py-6">Servicio</th>
                      <th className="px-10 py-6 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {reservations.map(res => (
                      <tr key={res.id} className="hover:bg-blue-50/40 transition-colors group">
                        <td className="px-10 py-6 font-mono font-bold text-blue-600">{res.reservationNo}</td>
                        <td className="px-10 py-6 font-black uppercase text-xs">{res.name}</td>
                        <td className="px-10 py-6 text-[9px] font-bold text-slate-400 uppercase">{res.serviceType}</td>
                        <td className="px-10 py-6 text-center">
                          <div className="flex justify-center gap-3">
                            <button 
                              onClick={() => {
                                setCurrentVoucher(res);
                                setShowVoucherModal({ show: true, reservation: res });
                              }} 
                              className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2"
                            >
                              <i className="fas fa-file-invoice"></i> Ver Voucher
                            </button>
                            <button 
                              onClick={() => handleEdit(res)} 
                              className="w-10 h-10 bg-orange-50 text-orange-500 rounded-xl hover:bg-orange-500 hover:text-white transition-all flex items-center justify-center"
                              title="Editar"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

const InputGroup: React.FC<{ label: string; name: string; type?: string; value: string; onChange?: any; placeholder?: string; highlight?: boolean }> = ({ label, name, type = 'text', value, onChange, placeholder, highlight = false }) => (
  <div className="flex flex-col group">
    <label className="text-[10px] uppercase font-black text-gray-400 mb-2 tracking-widest pl-1">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder} className={`border-2 border-gray-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 bg-white focus:border-blue-500 outline-none transition-all shadow-sm ${highlight ? 'text-orange-600 border-orange-50' : ''}`} />
  </div>
);

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

import React, { useState } from 'react';
import { AgencySettings } from '../types';
import { DEFAULT_AGENCY_SETTINGS, saveAgencySettings, fileToBase64, applyFavicon } from '../agencyService';

interface AgencySettingsViewProps {
  settings: AgencySettings;
  onUpdateSettings: (newSettings: AgencySettings) => void;
  showToast: (msg: string) => void;
}

export const AgencySettingsView: React.FC<AgencySettingsViewProps> = ({
  settings,
  onUpdateSettings,
  showToast,
}) => {
  const [formData, setFormData] = useState<AgencySettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleInputChange = (field: keyof AgencySettings, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileUpload = async (field: 'faviconUrl' | 'logoUrl', file: File) => {
    setUploadError(null);
    if (!file) return;

    // Check size limit (max 4MB for logo/favicon data url)
    if (file.size > 4 * 1024 * 1024) {
      setUploadError('El archivo es demasiado grande (máximo 4MB). Por favor selecciona una imagen más ligera.');
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setFormData(prev => ({
        ...prev,
        [field]: base64
      }));
      if (field === 'faviconUrl') {
        applyFavicon(base64);
      }
      showToast(field === 'faviconUrl' ? '✓ Favicon cargado con éxito' : '✓ Logotipo cargado con éxito');
    } catch (err) {
      console.error('Error reading file:', err);
      setUploadError('No se pudo procesar la imagen seleccionada.');
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      saveAgencySettings(formData);
      onUpdateSettings(formData);
      showToast('✓ ¡Configuración de agencia y marca guardada exitosamente!');
    } catch (e) {
      console.error(e);
      showToast('⚠️ Error al guardar configuración');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('¿Deseas restablecer los datos de la agencia a los valores predeterminados (Quick Travel Cancún)?')) {
      setFormData({ ...DEFAULT_AGENCY_SETTINGS });
      saveAgencySettings(DEFAULT_AGENCY_SETTINGS);
      onUpdateSettings(DEFAULT_AGENCY_SETTINGS);
      showToast('✓ Valores predeterminados restaurados');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0a305e] via-[#0d3f7a] to-[#0a305e] p-6 sm:p-8 rounded-[32px] text-white shadow-xl flex flex-wrap items-center justify-between gap-6 border border-white/10">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-orange-300">
            <i className="fas fa-magic text-xs"></i>
            <span>Personalización de Marca y Vouchers</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">
            Configuración de Agencia de Viajes
          </h2>
          <p className="text-xs sm:text-sm text-blue-100 font-medium leading-relaxed">
            Personaliza el nombre de tu agencia, el favicon de la pestaña del navegador, el logotipo principal y los datos de contacto que se muestran en todos los vouchers impresos, digitales y órdenes de servicio.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black text-[11px] uppercase transition-all flex items-center gap-2 cursor-pointer border border-white/10"
            title="Restablecer a valores iniciales"
          >
            <i className="fas fa-undo text-xs"></i>
            <span>Restablecer</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2.5 rounded-xl bg-[#f05a28] hover:bg-[#d94a1a] text-white font-black text-[11px] uppercase tracking-wider transition-all shadow-lg flex items-center gap-2 cursor-pointer active:scale-95"
          >
            <i className="fas fa-save text-xs"></i>
            <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-3">
          <i className="fas fa-exclamation-circle text-base"></i>
          <span>{uploadError}</span>
        </div>
      )}

      {/* Main Grid: Form Inputs & Live Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Form Inputs (7 cols) */}
        <div className="lg:col-span-7 space-y-6">

          {/* 1. Nombre de la Agencia & Slogan */}
          <div className="bg-white p-6 sm:p-7 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0a305e] flex items-center justify-center font-bold text-sm">
                <i className="fas fa-building"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                  Datos de la Agencia
                </h3>
                <p className="text-[10px] text-gray-400 font-medium">Nombre visible en el encabezado, vouchers y pestaña</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Nombre de la Agencia de Viajes *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.agencyName}
                    onChange={(e) => handleInputChange('agencyName', e.target.value)}
                    placeholder="Ej. Quick Travel Cancún / Tu Agencia de Viajes"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-bold text-gray-800 transition-all pl-10"
                  />
                  <i className="fas fa-tag absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Slogan o Giro Comercial (Opcional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.slogan || ''}
                    onChange={(e) => handleInputChange('slogan', e.target.value)}
                    placeholder="Ej. Transportación Ejecutiva & Tours en Cancún"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-medium text-gray-800 transition-all pl-10"
                  />
                  <i className="fas fa-quote-left absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>
            </div>
          </div>

          {/* 2. Favicon de la Agencia */}
          <div className="bg-white p-6 sm:p-7 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#f05a28] flex items-center justify-center font-bold text-sm">
                <i className="fas fa-globe"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                  Favicon (Icono del Navegador)
                </h3>
                <p className="text-[10px] text-gray-400 font-medium">El icono que se muestra en la pestaña superior de Google Chrome / Safari</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {/* Favicon Preview */}
                <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 p-2 flex items-center justify-center shrink-0 shadow-xs relative group overflow-hidden">
                  {formData.faviconUrl ? (
                    <img 
                      src={formData.faviconUrl} 
                      alt="Favicon Preview" 
                      className="w-10 h-10 object-contain rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/favicon.svg';
                      }}
                    />
                  ) : (
                    <i className="fas fa-image text-gray-300 text-xl"></i>
                  )}
                </div>

                {/* Upload Action */}
                <div className="flex-1 space-y-1.5">
                  <span className="text-xs font-black text-gray-800 block">Subir Icono / Favicon</span>
                  <p className="text-[10px] text-gray-500 font-medium">Formatos recomendados: PNG cuadrado, ICO o SVG (32x32 o 64x64 px).</p>
                  <label className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#0a305e] hover:bg-[#12427d] text-white rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shadow-xs">
                    <i className="fas fa-upload text-xs"></i>
                    <span>Examinar Imagen</span>
                    <input
                      type="file"
                      accept="image/png, image/x-icon, image/svg+xml, image/jpeg, image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload('faviconUrl', e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  O pegar URL directa del Favicon:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.faviconUrl}
                    onChange={(e) => {
                      handleInputChange('faviconUrl', e.target.value);
                      applyFavicon(e.target.value);
                    }}
                    placeholder="https://ejemplo.com/favicon.png o ruta /input_file_3.png"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-1 focus:ring-[#0a305e] outline-none text-xs text-gray-700 font-mono transition-all pl-9"
                  />
                  <i className="fas fa-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Logotipo de la Agencia */}
          <div className="bg-white p-6 sm:p-7 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-sm">
                <i className="fas fa-image"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                  Logotipo Oficial de la Agencia
                </h3>
                <p className="text-[10px] text-gray-400 font-medium">Logotipo visible en el encabezado del sistema, los vouchers y PDF</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {/* Logo Preview */}
                <div className="w-28 h-20 rounded-2xl bg-white border border-gray-200 p-2 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                  {formData.logoUrl ? (
                    <img 
                      src={formData.logoUrl} 
                      alt="Logo Preview" 
                      className="max-h-16 max-w-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/favicon.svg';
                      }}
                    />
                  ) : (
                    <i className="fas fa-image text-gray-300 text-2xl"></i>
                  )}
                </div>

                {/* Upload Action */}
                <div className="flex-1 space-y-1.5">
                  <span className="text-xs font-black text-gray-800 block">Subir Logotipo de la Agencia</span>
                  <p className="text-[10px] text-gray-500 font-medium">Recomendado: Imagen con fondo transparente (PNG o SVG) en orientación horizontal.</p>
                  <label className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#0a305e] hover:bg-[#12427d] text-white rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all shadow-xs">
                    <i className="fas fa-upload text-xs"></i>
                    <span>Examinar Logotipo</span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/svg+xml, image/webp"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload('logoUrl', e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  O pegar URL directa del Logotipo:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.logoUrl}
                    onChange={(e) => handleInputChange('logoUrl', e.target.value)}
                    placeholder="https://ejemplo.com/logo.png o ruta local"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-1 focus:ring-[#0a305e] outline-none text-xs text-gray-700 font-mono transition-all pl-9"
                  />
                  <i className="fas fa-link absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Teléfono y Canales de Comunicación */}
          <div className="bg-white p-6 sm:p-7 rounded-[28px] shadow-sm border border-gray-100 space-y-5">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
                <i className="fas fa-phone-alt"></i>
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                  Teléfonos & Canales de Contacto
                </h3>
                <p className="text-[10px] text-gray-400 font-medium">Números para atención a clientes, soporte y despacho a choferes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Teléfono / WhatsApp de Atención *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
                    placeholder="+52 998 212 7348"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-bold text-gray-800 transition-all pl-10"
                  />
                  <i className="fab fa-whatsapp absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-600 text-sm"></i>
                </div>
                <span className="text-[9px] text-gray-400 block mt-1">Visible en el pie de página del voucher</span>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Teléfono de Despacho (Choferes) *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.phoneDispatch}
                    onChange={(e) => handleInputChange('phoneDispatch', e.target.value)}
                    placeholder="529982127348"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-bold text-gray-800 transition-all pl-10"
                  />
                  <i className="fas fa-headset absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0a305e] text-xs"></i>
                </div>
                <span className="text-[9px] text-gray-400 block mt-1">Destino de los enlaces de reporte de estatus</span>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Correo Electrónico Oficial *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="info@tuagencia.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-bold text-gray-800 transition-all pl-10"
                  />
                  <i className="fas fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-700 uppercase tracking-wider mb-1.5">
                  Sitio Web Oficial (Opcional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.website || ''}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="https://tuagencia.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#0a305e] focus:ring-2 focus:ring-[#0a305e]/20 outline-none text-sm font-medium text-gray-800 transition-all pl-10"
                  />
                  <i className="fas fa-globe absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-5 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 font-black text-xs uppercase transition-all cursor-pointer"
            >
              <i className="fas fa-rotate-left mr-2"></i>
              Restaurar Valores Originales
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-3.5 rounded-2xl bg-[#f05a28] hover:bg-[#d94a1a] text-white font-black text-xs uppercase tracking-wider transition-all shadow-xl flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <i className="fas fa-check-circle text-sm"></i>
              <span>{isSaving ? 'Guardando Cambios...' : 'Guardar y Aplicar Marca'}</span>
            </button>
          </div>

        </div>

        {/* Right Column: Live Mockup & Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-6">

          {/* Mock Browser Tab Preview */}
          <div className="bg-white p-5 rounded-[28px] shadow-sm border border-gray-100 space-y-3">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Vista Previa en Pestaña del Navegador
            </span>
            <div className="bg-slate-200 rounded-xl p-2 pt-2.5">
              <div className="bg-white rounded-t-lg px-3 py-1.5 max-w-[260px] flex items-center gap-2 shadow-xs border-b border-transparent">
                <img 
                  src={formData.faviconUrl || '/favicon.svg'} 
                  alt="Favicon" 
                  className="w-4 h-4 object-contain rounded-xs shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/favicon.svg';
                  }}
                />
                <span className="text-[11px] font-bold text-gray-800 truncate">
                  {formData.agencyName || 'Agencia de Viajes'}
                </span>
                <i className="fas fa-times text-[9px] text-gray-400 ml-auto"></i>
              </div>
              <div className="bg-white rounded-b-lg p-2.5 flex items-center gap-2 border-t border-slate-100">
                <i className="fas fa-lock text-[10px] text-emerald-600"></i>
                <div className="h-4 bg-slate-100 rounded-full flex-1 px-3 text-[10px] text-gray-500 font-mono flex items-center">
                  {formData.website ? formData.website.replace('https://', '') : 'reservas.tuagencia.com'}
                </div>
              </div>
            </div>
            <p className="text-[9px] text-slate-500 italic">
              Al guardar, el favicon y el título se aplican de forma inmediata en tu navegador.
            </p>
          </div>

          {/* Live Voucher Header Mockup */}
          <div className="bg-white p-5 rounded-[28px] shadow-sm border border-gray-100 space-y-4">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
              Vista Previa en Encabezado de Voucher
            </span>
            
            <div className="p-4 rounded-2xl border border-gray-200 bg-white shadow-xs relative overflow-hidden space-y-3">
              <div className="flex justify-between items-center pb-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 flex items-center">
                    {formData.logoUrl ? (
                      <img 
                        src={formData.logoUrl} 
                        alt="Logo" 
                        className="h-9 max-w-[130px] object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/favicon.svg';
                        }}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-slate-100 rounded flex items-center justify-center font-bold text-xs text-gray-400">
                        LOGO
                      </div>
                    )}
                  </div>
                  <div className="h-8 w-px bg-gray-200"></div>
                  <div>
                    <h4 className="text-xs font-black text-[#0a305e] uppercase tracking-tight leading-none">
                      VOUCHER DE CONFIRMACIÓN
                    </h4>
                    <p className="text-[9px] font-black text-[#f05a28] uppercase tracking-wider mt-1">
                      {formData.agencyName || 'Tu Agencia'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[6px] text-gray-400 uppercase font-black">RESERVA</p>
                  <p className="text-sm font-mono font-black text-[#f05a28]">#QT-2026-DEMO</p>
                </div>
              </div>

              {/* Sample Destination without truncation */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                <div className="text-[7px] text-gray-400 font-black uppercase">RECOLECCIÓN (PICK-UP) / DESDE</div>
                <div className="text-xs font-black text-blue-700 flex items-start gap-1">
                  <i className="fas fa-map-marker-alt text-[9px] text-blue-500 mt-0.5 shrink-0"></i>
                  <span className="break-words">Grand Palladium Costa Mujeres Resort & Spa (Nombre Completo)</span>
                </div>
              </div>

              {/* Sample Voucher Footer */}
              <div className="pt-2 border-t border-gray-100 flex flex-wrap justify-between items-center text-[7px] text-gray-500 font-bold uppercase">
                <span>© {formData.agencyName || 'Tu Agencia'}</span>
                <span>Tel: {formData.phoneNumber || '+52 998 212 7348'}</span>
                <span>{formData.email || 'contacto@agencia.com'}</span>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200/80 p-3.5 rounded-2xl flex items-start gap-3">
              <i className="fas fa-check-circle text-emerald-600 mt-0.5 text-sm shrink-0"></i>
              <div className="text-[10px] text-emerald-800 leading-relaxed font-medium">
                <strong className="font-black uppercase block text-[10px] text-emerald-900 mb-0.5">
                  Corrección de casillas de hotel activa:
                </strong>
                Las casillas de <strong>DESDE</strong> y <strong>RECOLECCIÓN (PICK-UP)</strong> ahora muestran el nombre completo de los hoteles sin cortes ni textos a la mitad, adaptándose automáticamente al largo del nombre tanto en pantalla como en vouchers impresos y descargas en imagen.
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

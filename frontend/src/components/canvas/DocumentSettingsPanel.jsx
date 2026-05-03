import { CircleHelp } from 'lucide-react';

const Toggle = ({ value, onChange, label, help }) => {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-black text-slate-700">{label}</p>
          <button type="button" title={help} className="text-slate-400 hover:text-slate-700">
            <CircleHelp size={14} />
          </button>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
};

const FieldLabel = ({ title, help }) => {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500">{title}</label>
      <button type="button" title={help} className="text-slate-400 hover:text-slate-700">
        <CircleHelp size={14} />
      </button>
    </div>
  );
};

const DocumentSettingsPanel = ({ value, onChange }) => {
  const update = (field, nextValue) => {
    onChange(field, nextValue);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 p-3 bg-slate-50/70">
      <section className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-wider text-sky-700">Pre-processing</h4>
        <Toggle
          value={Boolean(value.remove_headers_footers)}
          onChange={(next) => update('remove_headers_footers', next)}
          label="remove_headers_footers"
          help="Eltavolitja az ismetlodo fejlec/lablec zajt, ami kulonben teves retrieval talalatokat okozhat."
        />
        <Toggle
          value={Boolean(value.normalize_whitespace)}
          onChange={(next) => update('normalize_whitespace', next)}
          label="normalize_whitespace"
          help="Normalizalja a whitespace mintazatot, igy stabilabb lesz a chunk-hatar es embedding minoseg."
        />
        <Toggle
          value={Boolean(value.ocr_enabled)}
          onChange={(next) => update('ocr_enabled', next)}
          label="ocr_enabled"
          help="Szkennelt PDF-eknel szovegreteget general; nelkule sok dokumentum nem lesz kereszheto."
        />

        <div>
          <FieldLabel
            title="ocr_dpi"
            help="Magasabb DPI javithatja az OCR pontossagat, de novelheti a feldolgozasi koltseget es idot."
          />
          <input
            type="number"
            min={150}
            max={600}
            step={50}
            value={Number(value.ocr_dpi || 300)}
            onChange={(event) => update('ocr_dpi', Number(event.target.value || 300))}
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-wider text-amber-700">Extraction Strategy</h4>

        <div>
          <FieldLabel
            title="page_range"
            help="Csak a relevans oldalak feldolgozasa csokkenti a zajt es javitja a valaszok relevanciajat."
          />
          <input
            type="text"
            placeholder="1-10, 15"
            value={value.page_range || ''}
            onChange={(event) => update('page_range', event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>

        <div>
          <FieldLabel
            title="image_handling"
            help="Kepek kihagyasa gyorsabb, kinyerese pedig tobb kontextust adhat vizualis dokumentumoknal."
          />
          <select
            value={(value.image_handling || 'ignore').toLowerCase()}
            onChange={(event) => update('image_handling', event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="ignore">Ignore</option>
            <option value="extract">Extract</option>
          </select>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Metadata Enrichment</h4>
        <Toggle
          value={Boolean(value.auto_tagging)}
          onChange={(next) => update('auto_tagging', next)}
          label="auto_tagging"
          help="Automatikus cimkezes segit domain-szuru keresest vegezni es jobb metadata alapu rerankinget ad."
        />

        <div>
          <FieldLabel
            title="source_label"
            help="Forrasazonosito alapjan szurheto, auditolhato es reprodukalhato a retrieval eredete."
          />
          <input
            type="text"
            value={value.source_label || ''}
            onChange={(event) => update('source_label', event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
      </section>
    </div>
  );
};

export default DocumentSettingsPanel;

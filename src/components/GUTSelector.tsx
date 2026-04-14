import { cn } from '@/lib/utils';

interface GUTSelectorProps {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  label?: string;
}

const GUT_LABELS = {
  gravidade: ['Sem gravidade', 'Pouco grave', 'Grave', 'Muito grave', 'Extremamente grave'],
  urgencia: ['Pode esperar', 'Pouco urgente', 'Urgente', 'Muito urgente', 'Ação imediata'],
  tendencia: ['Estável', 'Piora lenta', 'Piora média', 'Piora rápida', 'Piora imediata'],
};

export default function GUTSelector({ value, onChange, disabled = false, label }: GUTSelectorProps) {
  const getGutClass = (score: number) => {
    switch (score) {
      case 1: return 'gut-1';
      case 2: return 'gut-2';
      case 3: return 'gut-3';
      case 4: return 'gut-4';
      case 5: return 'gut-5';
      default: return 'bg-muted';
    }
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          onClick={() => {
            if (disabled) return;
            // Toggle: if clicking on already selected value, set to null
            if (value === score) {
              onChange(null);
            } else {
              onChange(score);
            }
          }}
          disabled={disabled}
          title={label ? GUT_LABELS[label as keyof typeof GUT_LABELS]?.[score - 1] : `Valor ${score}`}
          className={cn(
            'w-7 h-7 rounded text-xs font-bold transition-all',
            value !== null && score === value 
              ? getGutClass(score) 
              : 'bg-muted/50 text-muted-foreground hover:bg-muted',
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            !disabled && (value === null || score !== value) && 'hover:scale-110'
          )}
        >
          {score}
        </button>
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  User,
  Building2,
  Plus,
  Loader2,
  X,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContactResult {
  id: string;
  nombre: string;
  email: string;
  telefono?: string | null;
  tipo: string;
  ubicacion?: string | null;
  company?: {
    id: string;
    nombre: string;
  } | null;
  perfilFiscal?: {
    nif: string;
    direccion: string;
    razonSocial: string;
  } | null;
}

interface ContactSearchSelectProps {
  value?: ContactResult | null;
  onSelect: (contact: ContactResult) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function ContactSearchSelect({
  value,
  onSelect,
  onClear,
  placeholder = 'Buscar cliente (Contacto o Empresa)...',
  className,
  disabled = false,
}: ContactSearchSelectProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ContactResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const searchContacts = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        search: query,
        limit: '10',
      });
      const res = await fetch(`/api/contacts?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data || []);
      }
    } catch (error) {
      console.error('Error searching contacts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (search.length >= 2) {
      debounceTimerRef.current = setTimeout(() => {
        searchContacts(search);
      }, 300);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [search, searchContacts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    const totalItems = results.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (contact: ContactResult) => {
    onSelect(contact);
    setSearch('');
    setIsOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    if (onClear) onClear();
    setSearch('');
  };

  if (value) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex-1 flex items-center gap-3 px-3 py-2 border rounded-md bg-primary/5 border-primary/20">
          <div className="p-2 bg-primary/10 rounded-full">
            {value.tipo === 'company' ? (
              <Building2 className="h-4 w-4 text-primary" />
            ) : (
              <User className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold truncate">{value.nombre}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {value.tipo === 'company' ? 'Empresa' : 'Persona'}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {value.email} {value.telefono ? `· ${value.telefono}` : ''}
            </div>
          </div>
          {!disabled && onClear && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
              onClick={handleClear}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value.length >= 2) {
              setIsOpen(true);
              setHighlightedIndex(0);
            }
          }}
          onFocus={() => {
            if (search.length >= 2) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-10 h-11 shadow-sm"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && (search.length >= 2) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-2 bg-popover border rounded-xl shadow-2xl max-h-[400px] overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No se encontraron clientes para "{search}"
            </div>
          ) : (
            <div className="p-2">
              <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Resultados Sugeridos
              </div>
              {results.map((contact, index) => (
                <div
                  key={contact.id}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer rounded-lg transition-all',
                    index === highlightedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                  onClick={() => handleSelect(contact)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className={cn(
                    "p-2 rounded-full",
                    index === highlightedIndex ? "bg-primary/20" : "bg-muted"
                  )}>
                    {contact.tipo === 'company' ? (
                      <Building2 className="h-4 w-4" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{contact.nombre}</span>
                      {contact.perfilFiscal?.nif && (
                        <Badge variant="secondary" className="text-[9px] h-4">
                          NIF: {contact.perfilFiscal.nif}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs opacity-70 truncate">
                      {contact.email} {contact.company?.nombre ? `· ${contact.company.nombre}` : ''}
                    </p>
                  </div>
                  {index === highlightedIndex && <Check className="h-4 w-4" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

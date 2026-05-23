import { describe, it, expect } from 'vitest';
import { transformLinkedInProfileToLead } from '@/lib/linkedin-api';

const profileBase = {
  id: 'linkedin-001',
  firstName: 'María',
  lastName: 'García',
  headline: 'Senior Software Engineer',
  publicProfileUrl: 'https://linkedin.com/in/mariagarcia',
  location: {
    name: 'Madrid',
    country: 'España',
  },
  industry: 'Tecnología',
  positions: [
    {
      title: 'Tech Lead',
      companyName: 'Acme Corp',
      current: true,
    },
    {
      title: 'Junior Developer',
      companyName: 'StartupXYZ',
      current: false,
    },
  ],
  emailAddress: 'maria@acme.com',
  phoneNumbers: [
    { number: '+34600000000', type: 'mobile' },
    { number: '+34910000000', type: 'work' },
  ],
};

describe('LinkedIn — transformLinkedInProfileToLead', () => {
  describe('Perfil completo', () => {
    const lead = transformLinkedInProfileToLead(profileBase);

    it('debe mapear firstName → nombre', () => {
      expect(lead.nombre).toBe('María');
    });

    it('debe mapear lastName → apellido', () => {
      expect(lead.apellido).toBe('García');
    });

    it('debe mapear emailAddress → email', () => {
      expect(lead.email).toBe('maria@acme.com');
    });

    it('debe mapear el primer teléfono → telefono', () => {
      expect(lead.telefono).toBe('+34600000000');
    });

    it('debe tomar la empresa de la posición actual', () => {
      expect(lead.empresa).toBe('Acme Corp');
    });

    it('debe tomar el cargo de la posición actual', () => {
      expect(lead.cargo).toBe('Tech Lead');
    });

    it('debe mapear location.country → pais', () => {
      expect(lead.pais).toBe('España');
    });

    it('debe mapear location.name → ciudad', () => {
      expect(lead.ciudad).toBe('Madrid');
    });

    it('debe mapear publicProfileUrl → linkedinUrl', () => {
      expect(lead.linkedinUrl).toBe('https://linkedin.com/in/mariagarcia');
    });

    it('debe mapear industry → industria', () => {
      expect(lead.industria).toBe('Tecnología');
    });

    it('debe marcar fuente como linkedin', () => {
      expect(lead.fuente).toBe('linkedin');
    });

    it('debe incluir metadata con linkedin_id y headline', () => {
      expect(lead.metadata).toEqual({
        linkedin_id: 'linkedin-001',
        headline: 'Senior Software Engineer',
      });
    });
  });

  describe('Perfil mínimo (sin campos opcionales)', () => {
    const lead = transformLinkedInProfileToLead({
      id: 'min-001',
      firstName: 'Juan',
      lastName: 'Pérez',
      headline: '',
    });

    it('debe devolver strings vacíos para campos faltantes', () => {
      expect(lead.nombre).toBe('Juan');
      expect(lead.apellido).toBe('Pérez');
      expect(lead.email).toBe('');
      expect(lead.telefono).toBe('');
      expect(lead.empresa).toBe('');
      expect(lead.pais).toBe('');
      expect(lead.ciudad).toBe('');
      expect(lead.linkedinUrl).toBe('');
      expect(lead.industria).toBe('');
    });

    it('debe usar headline como cargo si no hay position actual', () => {
      const leadWithHeadline = transformLinkedInProfileToLead({
        id: 'min-002',
        firstName: 'Ana',
        lastName: 'López',
        headline: 'CTO',
      });
      expect(leadWithHeadline.cargo).toBe('CTO');
    });

    it('cargo debe ser string vacío si no hay position ni headline', () => {
      const leadNoData = transformLinkedInProfileToLead({
        id: 'min-003',
        firstName: 'Sin',
        lastName: 'Cargo',
        headline: '',
      });
      expect(leadNoData.cargo).toBe('');
    });

    it('debe preservar linkedin_id en metadata aunque headline esté vacío', () => {
      expect(lead.metadata).toEqual({
        linkedin_id: 'min-001',
        headline: '',
      });
    });
  });

  describe('Edge cases', () => {
    it('debe tomar el primer current position (ignorar no-current)', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-001',
        firstName: 'Test',
        lastName: 'User',
        headline: 'Old Headline',
        positions: [
          { title: 'Old Job', companyName: 'Old Corp', current: false },
          { title: 'New Job', companyName: 'New Corp', current: true },
          { title: 'Side Hustle', companyName: 'Side LLC', current: true },
        ],
      });
      // Debe tomar la primera posición current (New Job)
      expect(lead.empresa).toBe('New Corp');
      expect(lead.cargo).toBe('New Job');
    });

    it('debe usar headline si no hay ninguna position current', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-002',
        firstName: 'Past',
        lastName: 'Jobs',
        headline: 'Headline Fallback',
        positions: [
          { title: 'Past Job 1', companyName: 'Past Corp 1', current: false },
          { title: 'Past Job 2', companyName: 'Past Corp 2', current: false },
        ],
      });
      expect(lead.cargo).toBe('Headline Fallback');
      expect(lead.empresa).toBe('');
    });

    it('debe manejar phoneNumbers undefined', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-003',
        firstName: 'No',
        lastName: 'Phone',
        headline: '',
      });
      expect(lead.telefono).toBe('');
    });

    it('debe manejar phoneNumbers vacío', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-004',
        firstName: 'Empty',
        lastName: 'Phones',
        headline: '',
        phoneNumbers: [],
      });
      expect(lead.telefono).toBe('');
    });

    it('debe manejar positions undefined', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-005',
        firstName: 'No',
        lastName: 'Positions',
        headline: 'Only Headline',
      });
      expect(lead.cargo).toBe('Only Headline');
      expect(lead.empresa).toBe('');
    });

    it('debe manejar location undefined', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-006',
        firstName: 'No',
        lastName: 'Location',
        headline: '',
      });
      expect(lead.pais).toBe('');
      expect(lead.ciudad).toBe('');
    });

    it('debe manejar nombres con acentos y caracteres especiales', () => {
      const lead = transformLinkedInProfileToLead({
        id: 'edge-007',
        firstName: 'José',
        lastName: "O'Connor-Smith",
        headline: 'Développeur',
      });
      expect(lead.nombre).toBe('José');
      expect(lead.apellido).toBe("O'Connor-Smith");
    });

    it('no debe mutar el objeto original', () => {
      const profile = { ...profileBase };
      const copy = JSON.parse(JSON.stringify(profile));
      transformLinkedInProfileToLead(profile);
      expect(profile).toEqual(copy);
    });
  });
});

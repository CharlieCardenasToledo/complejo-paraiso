import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'formatDateSpanish',
  standalone: true,
})
export class FormatDateSpanishPipe implements PipeTransform {
  transform(value: Date | string | number | null | undefined): string {
    if (!value) {
      return 'Fecha no válida';
    }

    let date: Date;

    if (typeof value === 'string' && value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        // Asume que el formato es dd/MM/yyyy
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Meses en JS van de 0 a 11
        const year = parseInt(parts[2], 10);

        date = new Date(year, month, day);
      } else {
        return 'Fecha no válida';
      }
    } else {
      date = new Date(value);
    }

    console.log('Fecha interpretada:', date);

    if (isNaN(date.getTime())) {
      return 'Fecha no válida';
    }

    const formatter = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return formatter.format(date);
  }
}

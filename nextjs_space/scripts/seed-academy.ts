import { prisma } from '../lib/db';
import { AcademyAuthService } from '../lib/auth/academy-auth';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) return console.log('No tenant found');

  const email = 'operario_test@volkern.com';
  const password = 'password123';

  // Check if user exists
  let user = await prisma.academyUser.findUnique({ 
    where: { email },
    include: { estudiante: true }
  });
  
  if (!user) {
    user = await AcademyAuthService.register({
      tenantId: tenant.id,
      email: email,
      password: password,
      firstName: 'Operario',
      lastName: 'Certificado'
    });
    console.log('Academy Learner Created:', email);
  } else {
    console.log('Academy Learner already exists:', email);
  }

  // Create a sample course if none exists
  const courseCount = await prisma.curso.count({ where: { tenantId: tenant.id } });
  
  if (courseCount === 0) {
    const quiz = await prisma.quiz.create({
      data: {
        tenantId: tenant.id,
        titulo: 'Examen de Seguridad Nivel 1',
        puntuajeMinimo: 80,
        preguntas: {
          create: [
            {
              pregunta: '¿Qué significa EPP?',
              orden: 1,
              opciones: [
                { id: 'a', texto: 'Equipo de Protección Personal', esCorrecta: true },
                { id: 'b', texto: 'Elemento de Producción Privada', esCorrecta: false },
                { id: 'c', texto: 'Estandar de Proceso Preventivo', esCorrecta: false }
              ]
            },
            {
              pregunta: '¿Cuál es el color universal para señales de advertencia?',
              orden: 2,
              opciones: [
                { id: 'a', texto: 'Rojo', esCorrecta: false },
                { id: 'b', texto: 'Amarillo', esCorrecta: true },
                { id: 'c', texto: 'Azul', esCorrecta: false }
              ]
            }
          ]
        }
      }
    });

    const course = await prisma.curso.create({
      data: {
        tenantId: tenant.id,
        titulo: 'Seguridad Industrial Nivel 1',
        descripcion: 'Protocolos básicos de seguridad en planta y uso de EPP.',
        nivel: 'principiante',
        publicado: true,
        urlSlug: 'seguridad-industrial-1',
        modulos: {
          create: [
            {
              titulo: 'Introducción a la Seguridad',
              orden: 1,
              lecciones: {
                create: [
                  {
                    titulo: 'Equipos de Protección Personal (EPP)',
                    orden: 1,
                    tipoContenido: 'video',
                    videoUrl: 'https://sample-videos.com/video123.mp4',
                    quizId: quiz.id
                  }
                ]
              }
            }
          ]
        }
      }
    });
    console.log('Sample Course and Quiz Created:', course.titulo);

    // Enroll the test user
    await prisma.inscripcion.upsert({
      where: { estudianteId_cursoId: { estudianteId: user!.estudiante!.id, cursoId: course.id } },
      update: {},
      create: {
        estudianteId: user!.estudiante!.id,
        cursoId: course.id,
        estado: 'activo'
      }
    });
  }
}

main().catch(console.error);

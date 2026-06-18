/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, ChangeEvent, ReactNode, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

import { motion, AnimatePresence } from "motion/react";
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Database, 
  ExternalLink,
  Building2,
  CreditCard,
  Hash,
  Calendar,
  ArrowRight,
  ShieldCheck,
  Trash2,
  User,
  Fingerprint,
  FileCheck,
  Info,
  Mail,
  Briefcase,
  FileUp,
  ChevronRight,
  Copy,
  Terminal,
  Code2,
  LogIn,
  LogOut,
  Lock,
  Search
} from 'lucide-react';

// Firebase imports
import { auth, googleProvider, db } from '@/src/lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';

// Local Draft IndexedDB helper
import { saveDraftFiles, getDraftFiles, clearDraftFiles } from '@/src/lib/indexedDB';

// DocuSeal import removed to prevent CORS issues via widget fetch
// Standard iframe is used instead

// UI Components from shadcn
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// Types for the extracted data
interface BankData {
  nombre_banco: string;
  tipo_cuenta: string;
  numero_cuenta: string;
  fecha_apertura: string;
}

interface FormState {
  nombreRazonSocial: string;
  tipoDocumento: string;
  numeroDocumento: string;
  servicios: string[];
  informacionGeneral: string;
  fechaNacimiento: string;
}

interface FileState {
  rut: File | null;
  cedula: File | null;
  certificacionBancaria: File | null;
  autorizacionImagen: File | null;
  acuerdoConfidencialidad: File | null;
  formatoInfoGeneral: File | null;
}

const HOJA_PRINCIPAL = "https://docs.google.com/spreadsheets/d/1sStkl8qfZD00QC76HWllhnjR4S3Eb31180BK5wAJ4fg/edit?gid=1185186934#gid=1185186934";
const HOJA_DESTINO = "https://docs.google.com/spreadsheets/d/1EEyfxPodw7TgVQz4flmCrOuaJ21nn0M2_e95iPm6ZUA/edit?gid=0#gid=0";

const SERVICIOS_OPTIONS = [
  "Servicios de Capacitación y talleres (formación y facilitación)",
  "Servicios de gestión para la intermediación laboral",
  "Servicios logísticos en campo",
  "Servicios de orientación psicosocial",
  "Artículos tecnológicos (proyectores, portátiles, cámaras, equipos de sonido, iluminación)",
  "Material educativo y didáctico (libros, cuadernos, guías de enseñanza, manuales)",
  "Material de promoción (folletos, carteles, merchandising)",
  "Recursos digitales (software, aplicaciones, plataformas de aprendizaje, contenido multimedia)",
  "Papelería (hojas, carpetas, bolígrafos, lápices, marcadores, organizadores)",
  "Producción de recursos audiovisuales (creación de videos, diseño, contenido multimedia)",
  "Investigación y evaluación (estudios de impacto, desarrollo de material pedagógico, análisis de estudios)",
  "Consultoría legal (asesoramiento jurídico, cumplimiento normativo)",
  "Asesoría financiera y contable (auditoría, contabilidad, planeación financiera)",
  "Consultoría organizacional (gestión de proyectos, diseño de estategias, fortalecimiento institucional)",
  "Organización de eventos (logística de talleres, conferencia, encuentros)",
  "Traducción e interpretación (traducción de documentos, interpretación en tiempo real)",
  "Marketing (diseño de estrategias de comunicación, difusión de marca, diseño de campañas)",
  "Servicio de transporte (traslado de personal, logística de mercancías, distribución)",
  "Servicio de alimentación (catering para eventos, comedores corporativos, suministro de alimentos preparados)",
  "Servicios de hospedaje y arrendamiento (alojamiento temporal, alquiler de oficinas, arrendamiento de locales comerciales)",
  "Cámaras de comercio y gremios empresariales"
];

const FORMATOS = {
  autorizacionImagen: "https://docs.google.com/document/d/1AX1ymfBxffX3OulLJWrx4czCZCHcYxKPHv6FOISTqOU/edit?tab=t.0",
  acuerdoConfidencialidad: "https://docs.google.com/document/d/1W3e7nPas1PmzgnUjZzRNsUemc3s9PYqK/edit",
  infoGeneral: "https://docs.google.com/spreadsheets/d/1ugoj0-r2XzirnBtIEUELPDG-PAbpuWSH/edit?gid=1836347409#gid=1836347409"
};

const ADMIN_EMAILS = [
  'administrativo@disruptia.co',
  'juansebastian@disruptia.co',
  'lizlopez200295@gmail.com'
];

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<FormState>({ 
    nombreRazonSocial: '', 
    tipoDocumento: '', 
    numeroDocumento: '',
    servicios: [],
    informacionGeneral: '',
    fechaNacimiento: ''
  });
  
  const [files, setFiles] = useState<FileState>({
    rut: null,
    cedula: null,
    certificacionBancaria: null,
    autorizacionImagen: null,
    acuerdoConfidencialidad: null,
    formatoInfoGeneral: null
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BankData | null>(null);
  const [saved, setSaved] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const bankFileInputRef = useRef<HTMLInputElement>(null);

  // Search & Firestore Draft persistent states
  const [searchServiceQuery, setSearchServiceQuery] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftLoadedMsg, setDraftLoadedMsg] = useState("");
  const [allDrafts, setAllDrafts] = useState<any[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Firestore Error Handler conforming to Firebase Integration Skill
  const handleAppFirestoreError = (error: unknown, operation: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write', path: string) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData?.map(p => ({
          providerId: p.providerId,
          email: p.email,
        })) || []
      },
      operationType: operation,
      path: path
    };
    console.error('Firestore Error Info:', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  // Save Progress
  const handleSaveDraft = async () => {
    if (!user) {
      setError("Inicia sesión para guardar tu progreso.");
      return;
    }
    setDraftSaving(true);
    setError(null);
    setDraftLoadedMsg("");
    try {
      // 1. Build meta info for files
      const filesMetadata: Record<string, { name: string; size: number; type: string } | null> = {};
      for (const [key, file] of Object.entries(files)) {
        if (file) {
          const f = file as File;
          filesMetadata[key] = {
            name: f.name,
            size: f.size,
            type: f.type
          };
        } else {
          filesMetadata[key] = null;
        }
      }

      const draftDocRef = doc(db, "drafts", user.uid);
      await setDoc(draftDocRef, {
        userId: user.uid,
        userEmail: user.email,
        nombreRazonSocial: form.nombreRazonSocial,
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento,
        servicios: form.servicios,
        informacionGeneral: form.informacionGeneral,
        fechaNacimiento: form.fechaNacimiento || "",
        bankData: result || null,
        filesMetadata: filesMetadata,
        updatedAt: new Date().toISOString()
      });

      // 2. Save actual blobs to IndexedDB
      await saveDraftFiles(user.uid, files);

      setDraftLoadedMsg("¡Información y archivos guardados en borrador!");
      setTimeout(() => setDraftLoadedMsg(""), 4000);
    } catch (err: any) {
      console.error("Save Draft Error:", err);
      setError("Error al guardar borrador. Es posible que falten permisos o que la conexión falló.");
      try {
        handleAppFirestoreError(err, 'write', `drafts/${user?.uid}`);
      } catch (logErr) {
        // Logged to console
      }
    } finally {
      setDraftSaving(false);
    }
  };

  // Restore Progress
  const loadDraftObj = useCallback(async (currentUser: FirebaseUser) => {
    try {
      const draftDocRef = doc(db, "drafts", currentUser.uid);
      const snap = await getDoc(draftDocRef);
      if (snap.exists()) {
        const data = snap.data();
        
        setForm({
          nombreRazonSocial: data.nombreRazonSocial || "",
          tipoDocumento: data.tipoDocumento || "",
          numeroDocumento: data.numeroDocumento || "",
          servicios: data.servicios || [],
          informacionGeneral: data.informacionGeneral || "",
          fechaNacimiento: data.fechaNacimiento || ""
        });

        if (data.bankData) {
          setResult(data.bankData);
        }

        // Restore real files blobs from IndexedDB
        const restoredFiles = await getDraftFiles(currentUser.uid);
        if (restoredFiles && Object.keys(restoredFiles).length > 0) {
          setFiles(prev => ({
            ...prev,
            ...restoredFiles
          }));
        }

        setDraftLoadedMsg("Borrador restaurado automáticamente.");
        setTimeout(() => setDraftLoadedMsg(""), 5000);
      }
    } catch (err: any) {
      console.error("Error loading draft:", err);
      try {
        handleAppFirestoreError(err, 'get', `drafts/${currentUser.uid}`);
      } catch (logErr) {}
    }
  }, []);

  // Fetch all drafts for admins
  const fetchAllDrafts = useCallback(async () => {
    setLoadingDrafts(true);
    setAllDrafts([]);
    try {
      const querySnapshot = await getDocs(collection(db, "drafts"));
      const draftsList: any[] = [];
      querySnapshot.forEach((doc) => {
        draftsList.push({ id: doc.id, ...doc.data() });
      });
      setAllDrafts(draftsList);
    } catch (err: any) {
      console.error("Error fetching drafts for admin:", err);
      try {
        handleAppFirestoreError(err, 'list', 'drafts');
      } catch (logErr) {}
    } finally {
      setLoadingDrafts(false);
    }
  }, []);

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email ? ADMIN_EMAILS.includes(currentUser.email.toLowerCase()) : false);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Load user draft when logged in
  useEffect(() => {
    if (user) {
      loadDraftObj(user);
    }
  }, [user, loadDraftObj]);

  // Load all drafts when admin logs in
  useEffect(() => {
    if (user && isAdmin) {
      fetchAllDrafts();
    } else {
      setAllDrafts([]);
    }
  }, [user, isAdmin, fetchAllDrafts]);



  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login Error:", err);
      setError("Error al iniciar sesión con Google.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResult(null);
      setSaved(false);
    } catch (err: any) {
      console.error("Logout Error:", err);
    }
  };

  const handleSign = async (templateName: string, templateId?: string) => {
    if (!user?.email) {
      setError("Inicia sesión para firmar documentos.");
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch("/api/docuseal/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          name: form.nombreRazonSocial || user.displayName || "Proveedor",
          templateName: templateName,
          templateId: templateId
        })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const signUrl = data.embedUrl || `https://www.docuseal.com/d/${data.slug}`;
      
      // Open the signature form URL in a new browser tab/window directly with no referrer
      window.open(signUrl, '_blank', 'noreferrer');
    } catch (err: any) {
      console.error("DocuSeal Error:", err);
      setError(`Error al iniciar firma: ${err.message}. Asegúrate de que la plantilla existe en DocuSeal.`);
    } finally {
      setLoading(false);
    }
  };

  const handleESignatureRedirect = (tipoDocumento: string) => {
    const email = user?.email || form.email || "";
    const name = form.nombreRazonSocial || user?.displayName || "";
    const baseUrl = "https://preparador-de-contratos-esignature-835087040502.us-west1.run.app";
    const redirectUrl = `${baseUrl}?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&tipo=${encodeURIComponent(tipoDocumento)}`;
    window.open(redirectUrl, '_blank', 'noreferrer');
  };

  // Initialize Gemini API
  const [logoError, setLogoError] = useState(false);
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '', apiVersion: 'v1beta' });

  const handleFileChange = (field: keyof FileState, e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFiles(prev => ({ ...prev, [field]: selectedFile }));
      if (field === 'certificacionBancaria') {
        setResult(null);
        setSaved(false);
      }
      setError(null);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const extractBankData = async () => {
    if (!files.certificacionBancaria) {
      setError("Por favor, carga la certificación bancaria primero.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const base64Data = await fileToBase64(files.certificacionBancaria);
      const mimeType = files.certificacionBancaria.type;

      const prompt = `Extrae la siguiente información del certificado bancario adjunto en formato JSON estricto sin bloques de código markdown: {"nombre_banco": "", "tipo_cuenta": "Ahorro o Corriente", "numero_cuenta": "", "fecha_apertura": "DD/MM/AAAA"}. Si no encuentras un dato, pon 'No encontrado'.`;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              nombre_banco: { type: Type.STRING },
              tipo_cuenta: { type: Type.STRING },
              numero_cuenta: { type: Type.STRING },
              fecha_apertura: { type: Type.STRING }
            },
            required: ["nombre_banco", "tipo_cuenta", "numero_cuenta", "fecha_apertura"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No se pudo obtener respuesta de la IA.");

      const data = JSON.parse(text) as BankData;
      setResult(data);
    } catch (err: any) {
      console.error("Error al procesar:", err);
      setError(err.message || "Error al procesar el documento bancario.");
    } finally {
      setLoading(false);
    }
  };

  const clearData = async () => {
    setForm({ 
      nombreRazonSocial: '', 
      tipoDocumento: '', 
      numeroDocumento: '',
      servicios: [],
      informacionGeneral: '',
      fechaNacimiento: ''
    });
    setFiles({
      rut: null,
      cedula: null,
      certificacionBancaria: null,
      autorizacionImagen: null,
      acuerdoConfidencialidad: null,
      formatoInfoGeneral: null
    });
    setResult(null);
    setError(null);
    setSaved(false);
    if (user) {
      try {
        await deleteDoc(doc(db, "drafts", user.uid));
        await clearDraftFiles(user.uid);
      } catch (dbErr) {
        console.error("Non-blocking error deleting draft on clearData:", dbErr);
      }
    }
  };

  const copyToClipboard = () => {
    const code = `// --- CONFIGURACIÓN DE GOOGLE DRIVE Y SHEETS ---
const HOJA_PRINCIPAL_ID = "1sStkl8qfZD00QC76HWllhnjR4S3Eb31180BK5wAJ4fg";
const HOJA_CUENTAS_ID = "1EEyfxPodw7TgVQz4flmCrOuaJ21nn0M2_e95iPm6ZUA";
const CARPETA_ARCHIVOS_ID = "1I-tW3FZhY9QkS55hG4C3JVitrx2qfpKQ";

// --- CONFIGURACIÓN DE LA NUEVA APP DE FIRMAS (ESIGNATURE) ---
const ESIGNATURE_API_KEY = "AIzaSyDgDZvH1fyCvclYsmvca-g4vaHUvACWjOQ"; 
const ESIGNATURE_URL = "https://preparador-de-contratos-esignature-835087040502.us-west1.run.app/api/v1/firmar"; // Ajusta el endpoint según tu API

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(CARPETA_ARCHIVOS_ID);
    
    // Función para subir archivos
    function uploadFile(fileData, fileName) {
      if (!fileData || !fileData.base64) return "No cargado";
      try {
        const decoded = Utilities.base64Decode(fileData.base64);
        const blob = Utilities.newBlob(decoded, fileData.type, fileName);
        return folder.createFile(blob).getUrl();
      } catch (err) { return "Error: " + err.toString(); }
    }

    // Subir archivos y obtener URLs
    const urls = {
      rut: uploadFile(data.rut, "RUT_" + data.numeroDocumento),
      cedula: uploadFile(data.cedula, "Cedula_" + data.numeroDocumento),
      banco: uploadFile(data.certificacionBancaria, "Banco_" + data.numeroDocumento),
      confidencialidad: uploadFile(data.acuerdoConfidencialidad, "Confidencialidad_" + data.numeroDocumento),
      imagen: uploadFile(data.autorizacionImagen, "Imagen_" + data.numeroDocumento),
      infoGral: uploadFile(data.formatoInfoGeneral, "InfoGral_" + data.numeroDocumento)
    };

    // 1. Guardar en Hoja Principal
    const sheetPrincipal = SpreadsheetApp.openById(HOJA_PRINCIPAL_ID).getSheets()[0];
    let headers = [];
    try {
      if (sheetPrincipal.getLastColumn() > 0) {
        headers = sheetPrincipal.getRange(1, 1, 1, sheetPrincipal.getLastColumn()).getValues()[0].map(function(h) {
          return h.toString().trim().toLowerCase();
        });
      }
    } catch (err) {
      console.log("No se pudieron leer las cabeceras: " + err);
    }

    let appendData;
    if (headers && headers.length > 0 && headers.some(function(h) { return h.includes("fechas de nacimientos") || h.includes("fecha de nacimiento"); })) {
      appendData = new Array(headers.length).fill("");
      appendData[0] = new Date();
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        if (h.includes("marca") || h.includes("fecha de registro") || h.includes("timestamp")) {
          appendData[i] = new Date();
        } else if (h.includes("nombre") || h.includes("razón") || h.includes("social") || h.includes("proveedor")) {
          appendData[i] = data.nombreRazonSocial || "";
        } else if (h.includes("tipo de documento") || h.includes("tipo documento")) {
          appendData[i] = data.tipoDocumento || "";
        } else if (h.includes("número de documento") || h.includes("numero documento") || h.includes("identificación") || h.includes("documento")) {
          appendData[i] = data.numeroDocumento || "";
        } else if (h.includes("servicio") || h.includes("bienes")) {
          appendData[i] = (data.servicios && data.servicios.join(", ")) || "";
        } else if (h.includes("información general") || h.includes("informacion general") || h.includes("personería")) {
          appendData[i] = data.informacionGeneral || "";
        } else if (h.includes("fecha de nacimiento") || h.includes("fechas de nacimientos")) {
          appendData[i] = data.fechaNacimiento || "";
        } else if (h.includes("rut")) {
          appendData[i] = urls.rut;
        } else if (h.includes("cédula") || h.includes("cedula")) {
          appendData[i] = urls.cedula;
        } else if (h.includes("banco") || h.includes("bancaria")) {
          appendData[i] = urls.banco;
        } else if (h.includes("confidencialidad")) {
          appendData[i] = urls.confidencialidad;
        } else if (h.includes("imagen") || h.includes("autorización")) {
          appendData[i] = urls.imagen;
        } else if (h.includes("formato") || h.includes("info")) {
          appendData[i] = urls.infoGral;
        }
      }
    } else {
      appendData = [
        new Date(), data.nombreRazonSocial || "", data.tipoDocumento || "", data.numeroDocumento || "",
        (data.servicios && data.servicios.join(", ")) || "", data.informacionGeneral || "",
        data.fechaNacimiento || "",
        urls.rut, urls.cedula, urls.banco, urls.confidencialidad, urls.imagen, urls.infoGral
      ];
    }
    sheetPrincipal.appendRow(appendData);

    // 2. Guardar en Hoja de Cuentas
    if (data.bankData) {
      const sheetCuentas = SpreadsheetApp.openById(HOJA_CUENTAS_ID).getSheets()[0];
      sheetCuentas.appendRow([
        new Date(), data.nombreRazonSocial || "", data.tipoDocumento || "", data.numeroDocumento || "",
        data.bankData.nombre_banco || "", data.bankData.tipo_cuenta || "", data.bankData.numero_cuenta || "", data.bankData.fecha_apertura || ""
      ]);
    }

    // 3. CAPA DE REDIRECCIÓN / ENVÍO A NUEVA APP DE FIRMAS
    // Se ejecuta si existe el correo electrónico del firmante
    if (data.email) {
      // Envío del Acuerdo de Confidencialidad
      enviarAEsignature(data.email, data.nombreRazonSocial, urls.confidencialidad, "Acuerdo de Confidencialidad");
      
      // Envío de la Autorización de Imagen
      enviarAEsignature(data.email, data.nombreRazonSocial, urls.imagen, "Autorización de Imagen");
    }

    return ContentService.createTextOutput(JSON.stringify({ "success": true })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "success": false, "error": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Función de conexión con la nueva App de Firmas (eSignature)
 */
function enviarAEsignature(email, nombre, archivoUrl, tipoDocumento) {
  
  // NOTA: Ajusta este payload según la estructura exacta que pida la API de tu app
  const payload = {
    "email": email,
    "nombre_firmante": nombre || "Firmante",
    "documento_url": archivoUrl, // Pasa la URL del archivo subido a Google Drive
    "tipo": tipoDocumento
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + ESIGNATURE_API_KEY.trim() // O el formato de cabecera que use tu app (ej. X-API-KEY)
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(ESIGNATURE_URL, options);
    console.log("Respuesta eSignature (" + tipoDocumento + "): " + response.getContentText());
  } catch (err) {
    console.log("Error al conectar con eSignature (" + tipoDocumento + "): " + err.toString());
  }
}`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleServiceToggle = (service: string) => {
    setForm(prev => {
      const isSelected = prev.servicios.includes(service);
      if (isSelected) {
        return { ...prev, servicios: prev.servicios.filter(s => s !== service) };
      } else {
        if (prev.servicios.length >= 3) return prev;
        return { ...prev, servicios: [...prev.servicios, service] };
      }
    });
  };

  const pruebaRapida = async () => {
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3eeT9uU_VaYWS5CPA712S7Cf72uL4krAMhdfEo2fnCx7kRE_8cCyeqQYv6ldXovXI/exec"; 
    const dataPrueba = {
      nombreRazonSocial: "Prueba de Conexión",
      numeroDocumento: "12345",
      tipoDocumento: "CC",
      servicios: ["Prueba"],
      informacionGeneral: "Si ves esto, el problema son los archivos pesados"
    };

    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        body: JSON.stringify(dataPrueba)
      });
      alert("Prueba enviada, revisa la hoja.");
    } catch (err) {
      console.error(err);
      alert("Error en la prueba rápida");
    }
  };

  const handleSubmit = async () => {
    if (!form.nombreRazonSocial || !form.numeroDocumento || !files.certificacionBancaria) {
      setError("Por favor, completa los campos obligatorios (*) y carga la certificación bancaria.");
      return;
    }

    if (form.informacionGeneral === 'Natural' && !form.fechaNacimiento) {
      setError("La fecha de nacimiento es obligatoria para las personas naturales.");
      return;
    }

    setLoading(true);
    setError(null);

    /**
     * FRONTEND - CONEXIÓN CON APPS SCRIPT
     */
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycby3eeT9uU_VaYWS5CPA712S7Cf72uL4krAMhdfEo2fnCx7kRE_8cCyeqQYv6ldXovXI/exec"; 

    // Función para convertir el archivo del input a Base64 limpio
    const processFile = async (file: File | null): Promise<any> => {
      if (!file) return null;
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            base64: (reader.result as string).split(',')[1], // Solo el contenido, sin el prefijo data:
            type: file.type
          });
        };
        reader.readAsDataURL(file);
      });
    };

    try {
      // Construimos el JSON con los mismos nombres que espera el script
      const payload = {
        email: user?.email,
        nombreRazonSocial: form.nombreRazonSocial, // Tus variables de estado de React
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento,
        servicios: form.servicios, 
        informacionGeneral: form.informacionGeneral,
        fechaNacimiento: form.fechaNacimiento || "",
        bankData: result, // El objeto con nombre_banco, etc.
        
        // Archivos procesados uno por uno
        rut: await processFile(files.rut),
        cedula: await processFile(files.cedula),
        certificacionBancaria: await processFile(files.certificacionBancaria),
        acuerdoConfidencialidad: await processFile(files.acuerdoConfidencialidad),
        autorizacionImagen: await processFile(files.autorizacionImagen),
        formatoInfoGeneral: await processFile(files.formatoInfoGeneral)
      };

      await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      // Clear draft files and text fields from DB after a successful submission
      if (user) {
        try {
          await deleteDoc(doc(db, "drafts", user.uid));
          await clearDraftFiles(user.uid);
        } catch (dbErr) {
          console.error("Non-blocking error deleting draft after submit:", dbErr);
        }
      }

      setSaved(true);
      alert("¡Enviado exitosamente!");
    } catch (err: any) {
      console.error(err);
      setError("Error al enviar datos");
      alert("Error al enviar datos");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFCFE]">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCFE] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background Gradient Elements */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-100/40 blur-[120px]" />
          <div className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-100/40 blur-[120px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative max-w-md w-full"
        >
          <Card className="border-0 shadow-2xl rounded-[2.5rem] bg-white/80 backdrop-blur-md overflow-hidden">
            <CardHeader className="text-center pt-10 pb-6">
              <div className="flex justify-center mb-6">
                <div className="relative h-16 px-10 bg-white rounded-full flex items-center justify-center border-2 border-black shadow-lg overflow-hidden">
                  <span className="text-xl font-black tracking-tighter text-black uppercase">DISRUPTIA</span>
                </div>
              </div>
              <CardTitle className="text-3xl font-black tracking-tight text-gray-900 mb-2 uppercase">Bienvenido</CardTitle>
              <CardDescription className="text-gray-500 font-medium text-lg leading-snug px-4">
                Inicia sesión para acceder al sistema de gestión de proveedores.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-10 pt-4 px-10">
              <Button 
                onClick={handleLogin}
                className="w-full h-16 bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 text-white rounded-2xl text-lg font-black shadow-xl shadow-purple-200 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <LogIn className="w-6 h-6" />
                CONECTAR CON GOOGLE
              </Button>
              <p className="mt-6 text-[10px] text-gray-400 font-black uppercase tracking-[0.2em] text-center">
                ACCESO RESTRINGIDO PARA PERSONAL AUTORIZADO
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFE] font-sans text-[#1A1A1A] pb-20">
      {/* Background Gradient Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[10%] w-[50%] h-[50%] rounded-full bg-purple-100/40 blur-[120px]" />
        <div className="absolute -bottom-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-indigo-100/40 blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 py-8 md:py-12 space-y-10">
        
        {/* Header with Disruptia Branding */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full blur opacity-10 group-hover:opacity-30 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative h-14 px-10 bg-white rounded-full flex items-center justify-center border-2 border-black shadow-lg overflow-hidden">
                <div className="absolute inset-1 border border-black rounded-full pointer-events-none opacity-20"></div>
                {!logoError ? (
                  <img 
                    src="https://disruptia.co/wp-content/uploads/2023/04/Logo-Disruptia-01.png" 
                    alt="Disruptia" 
                    className="h-6 w-auto object-contain brightness-0"
                    referrerPolicy="no-referrer"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-xl font-black tracking-tighter text-black">DISRUPTIA</span>
                )}
              </div>
            </div>
            <div>
              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-purple-700 via-indigo-800 to-purple-900 uppercase">
                Disruptia <span className="font-light text-gray-400">Flow-Sync</span>
              </h1>
              <div className="flex flex-col text-[10px] font-black text-gray-400 tracking-widest uppercase mt-1">
                <span>NIT 901196915-3</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-purple-500" /> facturas@disruptia.co</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowSetup(!showSetup)}
                  className="text-purple-600 hover:bg-purple-50 font-black text-[10px] tracking-widest uppercase"
                >
                  <Terminal className="w-4 h-4 mr-2" />
                  Configuración Google
                </Button>
                <a 
                  href={HOJA_PRINCIPAL} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline" }), 
                    "border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl font-bold"
                  )}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Hoja Principal
                </a>
                <a 
                  href={HOJA_DESTINO} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={cn(
                    buttonVariants({ variant: "outline" }), 
                    "border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl font-bold"
                  )}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Hoja Cuentas
                </a>
              </>
            )}
            <Button 
              variant="outline" 
              onClick={handleLogout}
              className="border-red-100 text-red-500 hover:bg-red-50 rounded-xl font-black text-[10px] tracking-widest uppercase"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Salir
            </Button>
          </div>
        </header>

        {/* Panel de Administración de Borradores */}
        <AnimatePresence>
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <Card className="border-2 border-indigo-150 bg-indigo-50/20 rounded-[2rem] overflow-hidden shadow-xl shadow-indigo-100/10">
                <CardHeader className="bg-indigo-50/50 border-b border-indigo-100 p-6 flex flex-row items-center justify-between flex-wrap gap-4">
                  <div>
                    <CardTitle className="text-lg font-black text-indigo-950 uppercase tracking-tighter flex items-center gap-2">
                      <Database className="w-5 h-5 text-indigo-600 animate-pulse" />
                      MONITOREO DE BORRADORES DE PROVEEDORES
                    </CardTitle>
                    <CardDescription className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mt-1">
                      Visualiza en tiempo real los avances y datos autoguardados por los usuarios
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={fetchAllDrafts}
                    disabled={loadingDrafts}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider px-4 py-2"
                  >
                    {loadingDrafts ? "SINCROLEENDO..." : "ACTUALIZAR MONITOREO"}
                  </Button>
                </CardHeader>
                <CardContent className="p-6">
                  {allDrafts.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 font-bold uppercase tracking-widest text-xs">
                      {loadingDrafts ? "Conectando con Firestore..." : "No se encontraron borradores activos."}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {allDrafts.map((draft) => (
                        <div key={draft.id} className="bg-white border-2 border-gray-100 rounded-3xl p-5 space-y-4 shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
                          <div className="flex justify-between items-start border-b border-gray-100 pb-3 gap-2">
                            <div className="min-w-0 flex-1">
                              <h4 className="font-black text-gray-950 text-xs truncate uppercase tracking-tight">
                                {draft.nombreRazonSocial || "Empresa no ingresada"}
                              </h4>
                              <span className="text-[9px] font-black text-indigo-600 block truncate mt-1">
                                {draft.userEmail}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono font-black border border-indigo-50 text-indigo-600 bg-indigo-50/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {draft.updatedAt ? new Date(draft.updatedAt).toLocaleDateString() : 'SIN FECHA'}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 text-[10px]">
                            <div>
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Identificación</span>
                              <span className="font-bold text-gray-700 block truncate">
                                {draft.tipoDocumento && draft.numeroDocumento ? `${draft.tipoDocumento} ${draft.numeroDocumento}` : 'COMPLETA'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Personería</span>
                              <span className="font-bold text-gray-700 block truncate">
                                {draft.informacionGeneral || 'VACÍA'}
                                {draft.informacionGeneral === 'Natural' && draft.fechaNacimiento ? ` (${draft.fechaNacimiento})` : ''}
                              </span>
                            </div>
                          </div>

                          {draft.servicios && draft.servicios.length > 0 && (
                            <div>
                              <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Servicios (MÁX 3)</span>
                              <div className="flex flex-wrap gap-1 max-h-[48px] overflow-y-auto">
                                {draft.servicios.map((s: string) => (
                                  <span key={s} className="text-[8px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md truncate max-w-[200px]">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {draft.bankData ? (
                            <div className="bg-gray-50/70 rounded-2xl p-3 border border-gray-100/80 space-y-1">
                              <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest block">EXTRACCIÓN BANCARIA</span>
                              <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-gray-600">
                                <div>
                                  <span className="text-[7.5px] text-gray-450 uppercase tracking-tight block">BANCO</span>
                                  <span className="truncate block font-black text-black">{draft.bankData.nombre_banco}</span>
                                </div>
                                <div>
                                  <span className="text-[7.5px] text-gray-450 uppercase tracking-tight block">CUENTA</span>
                                  <span className="truncate block font-black text-black">{draft.bankData.numero_cuenta} ({draft.bankData.tipo_cuenta})</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[8px] text-gray-400 font-bold bg-gray-50 rounded-2xl p-3 text-center border-2 border-dashed border-gray-100">
                              PENDIENTE EXTRACCIÓN BANCARIA
                            </div>
                          )}

                          {draft.filesMetadata && Object.keys(draft.filesMetadata).some(k => draft.filesMetadata[k]) ? (
                            <div className="space-y-1">
                              <span className="text-[8px] font-black text-gray-450 uppercase tracking-widest block">Documentos Adjuntados</span>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(draft.filesMetadata).map(([key, value]: [string, any]) => {
                                  if (!value) return null;
                                  return (
                                    <span key={key} className="text-[8px] font-black bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1 uppercase tracking-tight">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                                      {key}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[8px] text-gray-400 font-bold bg-gray-50 rounded-2xl p-2.5 text-center border-2 border-dashed border-gray-100">
                              SIN ARCHIVOS EN BORRADOR
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="bg-white/60 backdrop-blur-md rounded-[2.5rem] p-8 md:p-12 border border-purple-50 shadow-2xl shadow-purple-100/20">
          <AnimatePresence>
            {showSetup && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-12"
              >
                <Card className="border-2 border-purple-100 bg-purple-50/30 rounded-[2rem]">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white">
                          <Code2 className="w-6 h-6" />
                        </div>
                        <div>
                          <CardTitle className="text-lg font-black uppercase tracking-tighter">Google Apps Script Setup</CardTitle>
                          <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Copia este código y pégalo en script.google.com</CardDescription>
                        </div>
                      </div>
                      <Button 
                        onClick={copyToClipboard}
                        className={`rounded-xl font-black transition-all ${copied ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'}`}
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                        {copied ? "COPIADO" : "COPIAR CÓDIGO"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[200px] w-full rounded-xl bg-gray-900 p-4 border border-gray-800">
                      <pre className="text-[10px] font-mono text-purple-300 leading-relaxed">
{`// --- CONFIGURACIÓN DE GOOGLE DRIVE Y SHEETS ---
const HOJA_PRINCIPAL_ID = "1sStkl8qfZD00QC76HWllhnjR4S3Eb31180BK5wAJ4fg";
const HOJA_CUENTAS_ID = "1EEyfxPodw7TgVQz4flmCrOuaJ21nn0M2_e95iPm6ZUA";
const CARPETA_ARCHIVOS_ID = "1I-tW3FZhY9QkS55hG4C3JVitrx2qfpKQ";

// --- CONFIGURACIÓN DE LA NUEVA APP DE FIRMAS (ESIGNATURE) ---
const ESIGNATURE_API_KEY = "AIzaSyDgDZvH1fyCvclYsmvca-g4vaHUvACWjOQ"; 
const ESIGNATURE_URL = "https://preparador-de-contratos-esignature-835087040502.us-west1.run.app/api/v1/firmar"; // Ajusta el endpoint según tu API

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(CARPETA_ARCHIVOS_ID);
    
    // Función para subir archivos
    function uploadFile(fileData, fileName) {
      if (!fileData || !fileData.base64) return "No cargado";
      try {
        const decoded = Utilities.base64Decode(fileData.base64);
        const blob = Utilities.newBlob(decoded, fileData.type, fileName);
        return folder.createFile(blob).getUrl();
      } catch (err) { return "Error: " + err.toString(); }
    }

    // Subir archivos y obtener URLs
    const urls = {
      rut: uploadFile(data.rut, "RUT_" + data.numeroDocumento),
      cedula: uploadFile(data.cedula, "Cedula_" + data.numeroDocumento),
      banco: uploadFile(data.certificacionBancaria, "Banco_" + data.numeroDocumento),
      confidencialidad: uploadFile(data.acuerdoConfidencialidad, "Confidencialidad_" + data.numeroDocumento),
      imagen: uploadFile(data.autorizacionImagen, "Imagen_" + data.numeroDocumento),
      infoGral: uploadFile(data.formatoInfoGeneral, "InfoGral_" + data.numeroDocumento)
    };

    // 1. Guardar en Hoja Principal
    const sheetPrincipal = SpreadsheetApp.openById(HOJA_PRINCIPAL_ID).getSheets()[0];
    let headers = [];
    try {
      if (sheetPrincipal.getLastColumn() > 0) {
        headers = sheetPrincipal.getRange(1, 1, 1, sheetPrincipal.getLastColumn()).getValues()[0].map(function(h) {
          return h.toString().trim().toLowerCase();
        });
      }
    } catch (err) {
      console.log("No se pudieron leer las cabeceras: " + err);
    }

    let appendData;
    if (headers && headers.length > 0 && headers.some(function(h) { return h.includes("fechas de nacimientos") || h.includes("fecha de nacimiento"); })) {
      appendData = new Array(headers.length).fill("");
      appendData[0] = new Date();
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        if (h.includes("marca") || h.includes("fecha de registro") || h.includes("timestamp")) {
          appendData[i] = new Date();
        } else if (h.includes("nombre") || h.includes("razón") || h.includes("social") || h.includes("proveedor")) {
          appendData[i] = data.nombreRazonSocial || "";
        } else if (h.includes("tipo de documento") || h.includes("tipo documento")) {
          appendData[i] = data.tipoDocumento || "";
        } else if (h.includes("número de documento") || h.includes("numero documento") || h.includes("identificación") || h.includes("documento")) {
          appendData[i] = data.numeroDocumento || "";
        } else if (h.includes("servicio") || h.includes("bienes")) {
          appendData[i] = (data.servicios && data.servicios.join(", ")) || "";
        } else if (h.includes("información general") || h.includes("informacion general") || h.includes("personería")) {
          appendData[i] = data.informacionGeneral || "";
        } else if (h.includes("fecha de nacimiento") || h.includes("fechas de nacimientos")) {
          appendData[i] = data.fechaNacimiento || "";
        } else if (h.includes("rut")) {
          appendData[i] = urls.rut;
        } else if (h.includes("cédula") || h.includes("cedula")) {
          appendData[i] = urls.cedula;
        } else if (h.includes("banco") || h.includes("bancaria")) {
          appendData[i] = urls.banco;
        } else if (h.includes("confidencialidad")) {
          appendData[i] = urls.confidencialidad;
        } else if (h.includes("imagen") || h.includes("autorización")) {
          appendData[i] = urls.imagen;
        } else if (h.includes("formato") || h.includes("info")) {
          appendData[i] = urls.infoGral;
        }
      }
    } else {
      appendData = [
        new Date(), data.nombreRazonSocial || "", data.tipoDocumento || "", data.numeroDocumento || "",
        (data.servicios && data.servicios.join(", ")) || "", data.informacionGeneral || "",
        data.fechaNacimiento || "",
        urls.rut, urls.cedula, urls.banco, urls.confidencialidad, urls.imagen, urls.infoGral
      ];
    }
    sheetPrincipal.appendRow(appendData);

    // 2. Guardar en Hoja de Cuentas
    if (data.bankData) {
      const sheetCuentas = SpreadsheetApp.openById(HOJA_CUENTAS_ID).getSheets()[0];
      sheetCuentas.appendRow([
        new Date(), data.nombreRazonSocial || "", data.tipoDocumento || "", data.numeroDocumento || "",
        data.bankData.nombre_banco || "", data.bankData.tipo_cuenta || "", data.bankData.numero_cuenta || "", data.bankData.fecha_apertura || ""
      ]);
    }

    // 3. CAPA DE REDIRECCIÓN / ENVÍO A NUEVA APP DE FIRMAS
    // Se ejecuta si existe el correo electrónico del firmante
    if (data.email) {
      // Envío del Acuerdo de Confidencialidad
      enviarAEsignature(data.email, data.nombreRazonSocial, urls.confidencialidad, "Acuerdo de Confidencialidad");
      
      // Envío de la Autorización de Imagen
      enviarAEsignature(data.email, data.nombreRazonSocial, urls.imagen, "Autorización de Imagen");
    }

    return ContentService.createTextOutput(JSON.stringify({ "success": true })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ "success": false, "error": error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Función de conexión con la nueva App de Firmas (eSignature)
 */
function enviarAEsignature(email, nombre, archivoUrl, tipoDocumento) {
  
  // NOTA: Ajusta este payload según la estructura exacta que pida la API de tu app
  const payload = {
    "email": email,
    "nombre_firmante": nombre || "Firmante",
    "documento_url": archivoUrl, // Pasa la URL del archivo subido a Google Drive
    "tipo": tipoDocumento
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + ESIGNATURE_API_KEY.trim() // O el formato de cabecera que use tu app (ej. X-API-KEY)
    },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  try {
    const response = UrlFetchApp.fetch(ESIGNATURE_URL, options);
    console.log("Respuesta eSignature (" + tipoDocumento + "): " + response.getContentText());
  } catch (err) {
    console.log("Error al conectar con eSignature (" + tipoDocumento + "): " + err.toString());
  }
}`}
                      </pre>
                    </ScrollArea>
                    <div className="mt-4 p-4 bg-white/50 rounded-2xl border border-purple-100 flex flex-col md:flex-row items-center justify-between gap-4">
                      <p className="text-[10px] font-bold text-purple-800 uppercase tracking-widest leading-relaxed">
                        Instrucciones: 1. Ve a script.google.com | 2. Crea un nuevo proyecto | 3. Pega el código | 4. Despliega como "Web App" | 5. Configura acceso para "Cualquier persona".
                      </p>
                      <Button 
                        onClick={pruebaRapida}
                        variant="outline"
                        className="border-purple-200 text-purple-700 hover:bg-purple-100 rounded-xl font-black text-[10px] uppercase tracking-widest whitespace-nowrap"
                      >
                        <Terminal className="w-3 h-3 mr-2" />
                        Ejecutar Prueba Rápida
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="max-w-3xl mx-auto space-y-4 text-center mb-12">
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Formulario de proveedores estratégicos Disruptia</h2>
            <p className="text-gray-500 font-medium text-lg">Por favor diligencia este formulario para tener completa tu información en nuestro sistema.</p>
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-purple-600 bg-purple-50 w-fit mx-auto px-4 py-2 rounded-full">
              <User className="w-4 h-4" />
              <span>{user.email} {isAdmin && "(Administrador)"}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            
            {/* Left Column: Form Fields */}
            <div className="lg:col-span-7 space-y-12">
              
              {/* Section 1: Datos de Identificación */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-black">1</div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Identificación</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">Nombre completo o razón social *</Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input 
                        placeholder="Nombre o Empresa" 
                        value={form.nombreRazonSocial}
                        onChange={(e) => setForm({...form, nombreRazonSocial: e.target.value})}
                        className="pl-12 py-6 rounded-2xl border-purple-50 focus:border-purple-500 focus:ring-purple-500 bg-gray-50/50 font-bold"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">Tipo de documento *</Label>
                    <Select onValueChange={(val) => setForm({...form, tipoDocumento: val})} value={form.tipoDocumento}>
                      <SelectTrigger className="py-6 rounded-2xl border-purple-50 bg-gray-50/50 font-bold">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                        <SelectItem value="NIT">NIT</SelectItem>
                        <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                        <SelectItem value="PP">Pasaporte</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">Número de documento *</Label>
                    <div className="relative">
                      <Fingerprint className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <Input 
                        placeholder="Documento" 
                        value={form.numeroDocumento}
                        onChange={(e) => setForm({...form, numeroDocumento: e.target.value})}
                        className="pl-12 py-6 rounded-2xl border-purple-50 focus:border-purple-500 focus:ring-purple-500 bg-gray-50/50 font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400 ml-1">Información general *</Label>
                  <RadioGroup 
                    onValueChange={(val) => setForm({
                      ...form, 
                      informacionGeneral: val, 
                      fechaNacimiento: val === 'Natural' ? form.fechaNacimiento : ''
                    })} 
                    value={form.informacionGeneral}
                    className="flex gap-8"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Natural" id="natural" className="border-purple-200 text-purple-600" />
                      <Label htmlFor="natural" className="font-bold text-gray-700">Natural</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Juridica" id="juridica" className="border-purple-200 text-purple-600" />
                      <Label htmlFor="juridica" className="font-bold text-gray-705 text-gray-700">Jurídica</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Campo Fecha de Nacimiento (Solo Obligatorio para Personas Naturales) */}
                <div className="space-y-2 pt-2">
                  <Label 
                    className={cn(
                      "text-[10px] font-black uppercase tracking-widest ml-1 transition-colors",
                      form.informacionGeneral === 'Natural' ? "text-purple-600" : "text-gray-400"
                    )}
                  >
                    Fecha de nacimiento {form.informacionGeneral === 'Natural' && "*"}
                  </Label>
                  <div className="relative">
                    <Input 
                      type="date"
                      disabled={form.informacionGeneral !== 'Natural'}
                      value={form.fechaNacimiento || ''}
                      onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })}
                      className={cn(
                        "py-6 rounded-2xl border-purple-50 focus:border-purple-500 focus:ring-purple-500 font-bold max-w-xs transition-all",
                        form.informacionGeneral === 'Natural' 
                          ? "bg-white border-purple-200 shadow-sm text-gray-900 cursor-default" 
                          : "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                      )}
                    />
                  </div>
                  {form.informacionGeneral === 'Natural' && !form.fechaNacimiento && (
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider ml-1 mt-1">
                      * Campo obligatorio para personas naturales
                    </p>
                  )}
                </div>
              </section>

              <Separator className="bg-purple-50" />

              {/* Section 2: Servicios */}
              <section className="space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-black">2</div>
                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Bienes o Servicios</h3>
                  </div>
                  <Badge variant="secondary" className="bg-purple-50 text-purple-600 font-black px-3 py-1 rounded-full text-[10px]">MÁXIMO 3</Badge>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                  <Input 
                    placeholder="Buscar bienes o servicios..." 
                    value={searchServiceQuery}
                    onChange={(e) => setSearchServiceQuery(e.target.value)}
                    className="pl-11 py-5 rounded-2xl border-purple-100 focus:border-purple-500 focus:ring-purple-500 bg-gray-50/50 font-bold text-xs uppercase tracking-wider"
                  />
                </div>
                
                <ScrollArea className="h-[300px] rounded-[2rem] border border-purple-50 bg-gray-50/30 p-6">
                  <div className="space-y-4">
                    {(() => {
                      const filteredServices = SERVICIOS_OPTIONS.filter(service => 
                        service.toLowerCase().includes(searchServiceQuery.toLowerCase())
                      );
                      
                      if (filteredServices.length === 0) {
                        return (
                          <div className="text-center py-12 text-xs font-bold text-gray-400 uppercase tracking-widest">
                            No se encontraron resultados
                          </div>
                        );
                      }
                      
                      return filteredServices.map((service) => (
                        <div key={service} className="flex items-start space-x-3 group">
                          <Checkbox 
                            id={service} 
                            checked={form.servicios.includes(service)}
                            onCheckedChange={() => handleServiceToggle(service)}
                            className="mt-1 border-purple-200 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                          />
                          <Label 
                            htmlFor={service} 
                            className={`text-sm font-bold leading-tight cursor-pointer transition-colors ${form.servicios.includes(service) ? 'text-purple-700' : 'text-gray-500 group-hover:text-gray-800'}`}
                          >
                            {service}
                          </Label>
                        </div>
                      ));
                    })()}
                  </div>
                </ScrollArea>
              </section>

              <Separator className="bg-purple-50" />

              {/* Section 3: Documentación */}
              <section className="space-y-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center text-white font-black">3</div>
                  <h3 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Documentación</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FileUploader 
                    label="Sube tu RUT *" 
                    desc="Formato: PDF (Máx 10MB)" 
                    icon={<FileText />} 
                    file={files.rut} 
                    onChange={(e) => handleFileChange('rut', e)} 
                  />
                  <FileUploader 
                    label="Copia de Cédula *" 
                    desc="PDF o Imagen (Máx 10MB)" 
                    icon={<Fingerprint />} 
                    file={files.cedula} 
                    onChange={(e) => handleFileChange('cedula', e)} 
                  />
                  <FileUploader 
                    label="Certificación Bancaria *" 
                    desc="PDF o Imagen (Máx 10MB)" 
                    icon={<Building2 />} 
                    file={files.certificacionBancaria} 
                    onChange={(e) => handleFileChange('certificacionBancaria', e)} 
                    isBank
                  />
                  <FileUploader 
                    label="Autorización Imagen *" 
                    desc="Formato: PDF (Máx 10MB)" 
                    icon={<FileUp />} 
                    file={files.autorizacionImagen} 
                    onChange={(e) => handleFileChange('autorizacionImagen', e)} 
                    formatUrl={FORMATOS.autorizacionImagen}
                    onSign={() => handleESignatureRedirect("Autorización de Imagen")}
                  />
                  <FileUploader 
                    label="Acuerdo Confidencialidad" 
                    desc="Formato: PDF (Máx 10MB)" 
                    icon={<ShieldCheck />} 
                    file={files.acuerdoConfidencialidad} 
                    onChange={(e) => handleFileChange('acuerdoConfidencialidad', e)} 
                    formatUrl={FORMATOS.acuerdoConfidencialidad}
                    onSign={() => handleESignatureRedirect("Acuerdo de Confidencialidad")}
                  />
                  <FileUploader 
                    label="Formato Info General" 
                    desc="Hoja de cálculo (Máx 10MB)" 
                    icon={<Database />} 
                    file={files.formatoInfoGeneral} 
                    onChange={(e) => handleFileChange('formatoInfoGeneral', e)} 
                    formatUrl={FORMATOS.infoGeneral}
                  />
                </div>
              </section>
            </div>

            {/* Right Column: AI Extraction & Summary */}
            <div className="lg:col-span-5 space-y-8">
              <div className="sticky top-8 space-y-8">
                
                {/* AI Extraction Panel */}
                <Card className="border-0 shadow-2xl shadow-purple-100/50 bg-gradient-to-br from-purple-600 to-indigo-800 text-white rounded-[2.5rem] overflow-hidden">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                        <Loader2 className={`w-6 h-6 ${loading ? 'animate-spin' : ''}`} />
                      </div>
                      <CardTitle className="text-xl font-black uppercase tracking-tighter">Extracción IA</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <p className="text-sm font-bold opacity-80 leading-tight">
                      Utilizamos Gemini AI para extraer automáticamente los datos de tu certificación bancaria y agilizar el registro.
                    </p>
                    
                    <Button 
                      onClick={extractBankData}
                      disabled={!files.certificacionBancaria || loading}
                      className="w-full bg-white text-purple-700 hover:bg-purple-50 py-8 rounded-2xl text-lg font-black shadow-xl transition-all active:scale-95"
                    >
                      {loading ? "PROCESANDO..." : "EXTRAER DATOS AHORA"}
                    </Button>

                    <AnimatePresence>
                      {result && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white/10 backdrop-blur-md rounded-3xl p-6 space-y-4 border border-white/10"
                        >
                          <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Vista Previa Registro Bancario</span>
                            <CheckCircle2 className="w-4 h-4 text-green-400" />
                          </div>
                          <div className="grid grid-cols-1 gap-4">
                            <div className="grid grid-cols-2 gap-4 border-b border-white/5 pb-3">
                              <ResultItem label="Proveedor" value={form.nombreRazonSocial || "No ingresado"} />
                              <ResultItem label="Documento" value={`${form.tipoDocumento} ${form.numeroDocumento}` || "No ingresado"} />
                            </div>
                            {form.informacionGeneral === 'Natural' && form.fechaNacimiento && (
                              <div className="border-b border-white/5 pb-3 text-left">
                                <ResultItem label="Fecha de Nacimiento" value={form.fechaNacimiento} />
                              </div>
                            )}
                            <div className="grid grid-cols-1 gap-4">
                              <ResultItem label="Banco" value={result.nombre_banco} />
                              <div className="grid grid-cols-2 gap-4">
                                <ResultItem label="Tipo Cuenta" value={result.tipo_cuenta} />
                                <ResultItem label="Número Cuenta" value={result.numero_cuenta} />
                              </div>
                              <ResultItem label="Fecha Apertura" value={result.fecha_apertura} />
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>

                {/* Final Actions */}
                <div className="space-y-4">
                  <Button 
                    onClick={handleSubmit}
                    disabled={loading || saved}
                    className={`w-full py-10 rounded-[2rem] text-2xl font-black transition-all duration-500 shadow-2xl ${saved ? 'bg-green-600' : 'bg-gray-900 hover:bg-black shadow-gray-200'}`}
                  >
                    {saved ? "FORMULARIO ENVIADO" : "ENVIAR FORMULARIO"}
                    {!saved && <ChevronRight className="ml-3 w-8 h-8" />}
                  </Button>
                  
                  <div className="flex gap-4">
                    <Button 
                      variant="outline" 
                      onClick={handleSaveDraft}
                      disabled={draftSaving || loading}
                      className="flex-1 border-purple-200 text-purple-700 hover:bg-purple-50 py-6 rounded-2xl font-black uppercase tracking-wider text-[11px]"
                    >
                      {draftSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin text-purple-600" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Database className="w-4 h-4 mr-2 text-purple-600" />
                          Guardar Progreso
                        </>
                      )}
                    </Button>

                    <Button 
                      variant="outline" 
                      onClick={clearData}
                      className="flex-1 border-purple-150 text-purple-400 hover:bg-red-50 hover:text-red-500 hover:border-red-100 py-6 rounded-2xl font-black uppercase tracking-wider text-[11px]"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      BORRAR TODO
                    </Button>
                  </div>
                </div>

                {/* Draft Loaded / Saved Status Indicator */}
                <AnimatePresence>
                  {draftLoadedMsg && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black uppercase tracking-wider rounded-2xl p-4 text-center flex items-center justify-center gap-2 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 animate-bounce" />
                      {draftLoadedMsg}
                    </motion.div>
                  )}
                </AnimatePresence>

                {error && (
                  <Alert variant="destructive" className="border-red-100 bg-red-50 rounded-3xl p-6">
                    <AlertCircle className="h-6 w-6" />
                    <AlertTitle className="font-black">Error</AlertTitle>
                    <AlertDescription className="font-bold opacity-80">{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <footer className="text-center pt-16 border-t border-gray-100">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="h-px w-12 bg-gray-200" />
            <Badge variant="outline" className="border-purple-100 text-purple-400 font-black text-[10px] tracking-[0.4em] px-6 py-2">DISRUPTIA TECH</Badge>
            <div className="h-px w-12 bg-gray-200" />
          </div>
          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
            © 2026 Disruptia S.A.S | Inteligencia Artificial Aplicada
          </p>
        </footer>


      </div>
    </div>
  );
}

function FileUploader({ label, desc, icon, file, onChange, isBank = false, formatUrl, onSign }: { label: string, desc: string, icon: ReactNode, file: File | null, onChange: (e: ChangeEvent<HTMLInputElement>) => void, isBank?: boolean, formatUrl?: string, onSign?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  
  return (
    <div className="space-y-2 group">
      <div className="flex items-center justify-between px-1">
        <Label className="text-[10px] font-black uppercase tracking-widest text-purple-400">{label}</Label>
        <div className="flex gap-2">
          {onSign && (
            <button 
              onClick={(e) => {
                e.preventDefault();
                onSign();
              }}
              className="text-[9px] font-black text-purple-600 hover:text-purple-800 flex items-center gap-1 bg-purple-50 px-2 py-0.5 rounded-full transition-all hover:scale-105 active:scale-95"
            >
              <Fingerprint className="w-3 h-3" />
              FIRMA ELECTRÓNICA
            </button>
          )}
          {formatUrl && (
            <a 
              href={formatUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[9px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded-full transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              DESCARGAR
            </a>
          )}
        </div>
      </div>
      <div 
        onClick={() => inputRef.current?.click()}
        className={`relative flex items-center gap-4 p-5 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${file ? 'border-green-200 bg-green-50/30' : 'border-purple-50 bg-gray-50/50 hover:border-purple-500 hover:bg-purple-50/30'}`}
      >
        <input type="file" ref={inputRef} onChange={onChange} className="hidden" />
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${file ? 'bg-green-100 text-green-600' : 'bg-white text-purple-400 group-hover:bg-purple-100 group-hover:text-purple-600'}`}>
          {file ? <CheckCircle2 className="w-6 h-6" /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-black truncate ${file ? 'text-green-700' : 'text-gray-700'}`}>
            {file ? file.name : "Seleccionar archivo"}
          </p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{desc}</p>
        </div>
        {isBank && !file && (
          <Badge className="absolute -top-2 -right-2 bg-purple-600 text-white text-[8px] px-2 py-0.5 rounded-full animate-pulse">IA READY</Badge>
        )}
      </div>
    </div>
  );
}

function ResultItem({ label, value }: { label: string, value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-[9px] font-black uppercase tracking-widest opacity-50">{label}</span>
      <p className="text-sm font-black tracking-tight">{value}</p>
    </div>
  );
}

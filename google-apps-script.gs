// --- CONFIGURACIÓN DE GOOGLE DRIVE Y SHEETS ---
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
}

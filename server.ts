import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recentSubmissions = new Map();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.use('/api', (req, res, next) => {
    res.setHeader('Service-Worker-Allowed', 'none');
    next();
  });

  // API Route for DocuSeal Submissions
  app.post("/api/docuseal/submissions", async (req, res) => {
    const { email, templateName, templateId, name } = req.body;
    const dedupKey = email + '_' + (templateId || templateName);
    const cached = recentSubmissions.get(dedupKey);
    if (cached && Date.now() - cached.timestamp < 5000) {
      console.log('Returning cached submission to prevent duplicate');
      return res.json(cached.data);
    }
    let DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY?.trim();

    // Fallback to the key provided by the user in their script if not in env
    if (!DOCUSEAL_API_KEY || DOCUSEAL_API_KEY === "") {
      DOCUSEAL_API_KEY = "YihBbK1p3q5yJ42NLswWLnCbBgpejgjr89xCzQ49kEC";
    }

    console.log(`Using API Key starting with: ${DOCUSEAL_API_KEY.substring(0, 5)}...`);

    if (!DOCUSEAL_API_KEY) {
      return res.status(500).json({ error: "DocuSeal API Key not configured" });
    }

    try {
      let targetTemplateId = templateId;
      
      // Define una única URL fija para la API de DocuSeal (sin 'www.' ni '.co' que causan error de HTML).
      // Si tu cuenta es global, usa https://api.docuseal.com
      // Si tu cuenta es europea, usa https://api.docuseal.eu
      // Podemos configurarlo de manera externa con la variable de entorno DOCUSEAL_API_URL
      const API_URL = process.env.DOCUSEAL_API_URL || "https://api.docuseal.com";

      if (!targetTemplateId && templateName) {
        console.log(`Searching for template: ${templateName} on ${API_URL}`);
        const templatesResponse = await fetch(`${API_URL}/templates`, {
          headers: {
            "X-Auth-Token": DOCUSEAL_API_KEY,
            "Accept": "application/json"
          },
        });

        if (templatesResponse.ok) {
          const templates = await templatesResponse.json();
          const template = templates.find((t: any) => t.name.toLowerCase().includes(templateName.toLowerCase()));
          if (template) {
            targetTemplateId = template.id;
          }
        }
      }

      if (!targetTemplateId) {
        throw new Error(`ID de plantilla no encontrado para: ${templateName || templateId}`);
      }

      const numericTemplateId = !isNaN(Number(targetTemplateId)) ? Number(targetTemplateId) : targetTemplateId;
      console.log(`Creating submission on ${API_URL} for template: ${numericTemplateId}`);

      const submissionResponse = await fetch(`${API_URL}/submissions`, {
        method: "POST",
        headers: {
          "X-Auth-Token": DOCUSEAL_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "DisruptiaFlowSync/1.1"
        },
        body: JSON.stringify({
          template_id: numericTemplateId,
          send_email: true,
          submitters: [
            {
              email: email,
              name: name || "Firmante",
              role: "Primera Parte",
            },
          ],
        }),
      });

      const responseText = await submissionResponse.text();
      
      if (submissionResponse.ok) {
        const submission = JSON.parse(responseText);
        const sub = Array.isArray(submission) ? submission[0] : submission;
        
        console.log("DocuSeal API Response payload:", JSON.stringify(sub));

        // Extraer el embed_url del firmante específico (submitter) para evitar problemas de X-Frame-Options
        let embedUrl = "";
        if (sub && sub.submitters && Array.isArray(sub.submitters) && sub.submitters.length > 0) {
          embedUrl = sub.submitters[0].embed_url || sub.submitters[0].url || "";
        } else if (sub && sub.embed_url) {
          embedUrl = sub.embed_url;
        } else if (sub && sub.url) {
          embedUrl = sub.url;
        }
        
        // Fallback por si acaso no viniera la url directa, construimos con el slug
        if (!embedUrl) {
          const isEU = API_URL.includes("docuseal.eu");
          const webDomain = isEU ? "https://eu.docuseal.com" : "https://www.docuseal.com";
          if (sub && sub.submitters && sub.submitters[0] && sub.submitters[0].slug) {
            embedUrl = webDomain + "/s/" + sub.submitters[0].slug;
          } else if (sub && sub.slug) {
            embedUrl = webDomain + "/s/" + sub.slug;
          }
        }

        console.log(`URL de firma para el frontend: ${embedUrl}`);
        const responseData = { slug: sub ? sub.slug : null, embedUrl: embedUrl };
        recentSubmissions.set(dedupKey, { timestamp: Date.now(), data: responseData });
        return res.json(responseData);
      } else {
        console.error("DocuSeal Error Response:", responseText);
        if (responseText.includes("<!DOCTYPE")) {
          throw new Error(`DocuSeal respondió con una página HTML de error. Asegúrate de configurar la URL de API correcta para tu cuenta (${API_URL}) y que el API key sea válido.`);
        }
        const errorData = JSON.parse(responseText);
        throw new Error(errorData.error || "Error desconocido al crear la firma");
      }
    } catch (error: any) {
      console.error("DocuSeal Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get('/service-worker.js', (req, res) => {
      res.setHeader('Content-Type', 'application/javascript');
      res.send('self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", e => e.waitUntil(self.clients.matchAll().then(clients => { clients.forEach(c => c.navigate(c.url)); return self.registration.unregister(); })));');
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

const express = require('express');
const bodyParser = require('body-parser');
const { Configuration, OpenAIApi } = require('openai');
const cors = require('cors');
const dotenv = require('dotenv');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const typeOfPerson = (
  "You are a bot that generates SAT problems. " +
  "You should write answers for them as the options A, B, C, D."
);

async function generateSatProblems(section, difficulty) {
  try {
    let numQuestions = section === "math" ? 10 : 10;

    if (difficulty === "easy") {
      numQuestions = 20;
    } else if (difficulty === "medium") {
      numQuestions = section === "math" ? 15 : 10;
    } else if (difficulty === "hard") {
      numQuestions = section === "math" ? 10 : 15;
    } else {
      throw new Error("Unsupported difficulty");
    }

    const prompt = (
      `You are a bot that generates SAT problems. ` +
      `The section is ${section} and the difficulty is ${difficulty}. ` +
      `Generate ${numQuestions} SAT problems with multiple choice answers. ` +
      `Please return your response in JSON format as a list of questions with the following structure:\n` +
      `[\n` +
      `  {\n` +
      `    "question": "Generate the SAT question",\n` +
      `    "choices": ["Option A", "Option B", "Option C", "Option D"],\n` +
      `    "answer": "Correct answer"\n` +
      `  }\n` +
      `]`
    );

    const response = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: typeOfPerson },
        { role: "user", content: prompt }
      ]
    });

    // Extracting and parsing the response
    const responseContent = response.data.choices[0].message.content.trim();
    const res = JSON.parse(responseContent);
    if (Array.isArray(res) && res.every(q => 'question' in q && 'choices' in q && 'answer' in q)) {
      return res;
    } else {
      throw new Error("Incomplete response from OpenAI");
    }
  } catch (error) {
    console.error(`Error generating SAT problems: ${error}`);
    throw error;
  }
}

app.post('/generate-sat-problem', async (req, res) => {
  try {
    const { section, difficulty } = req.body;

    if (!section || !difficulty) {
      return res.status(400).json({ error: "Section and difficulty are required" });
    }

    const problems = await generateSatProblems(section, difficulty);
    res.status(200).json(problems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/generate-pdf', async (req, res) => {
  try {
    const { section, difficulty } = req.body;

    if (!section || !difficulty) {
      return res.status(400).json({ error: "Section and difficulty are required" });
    }

    const problems = await generateSatProblems(section, difficulty);

    const doc = new PDFDocument();
    const filePath = path.join(__dirname, 'sat_problems.pdf');
    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(16).text(`SAT ${section.charAt(0).toUpperCase() + section.slice(1)} Problems - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Difficulty`, { align: 'center' });
    doc.moveDown();

    problems.forEach((problem, index) => {
      doc.fontSize(12).text(`Question ${index + 1}: ${problem.question}`);
      problem.choices.forEach((choice, idx) => {
        doc.text(`   ${String.fromCharCode(65 + idx)}. ${choice}`);
      });
      doc.text(`Answer: ${problem.answer}`);
      doc.moveDown();
    });

    doc.end();

    res.download(filePath, 'sat_problems.pdf', (err) => {
      if (err) {
        console.error(`Error sending PDF file: ${err}`);
        res.status(500).json({ error: "Failed to generate PDF" });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

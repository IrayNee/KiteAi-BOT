import axios from 'axios';
import dotenv from 'dotenv';
import inquirer from 'inquirer';
import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs';

// Load environment variables
dotenv.config();

// Load payloads from JSON file
let payloads = JSON.parse(fs.readFileSync('payloads.json', 'utf-8'));

// MAIN API URLs
const mainApiUrls = [
  'https://deployment-hp4y88pxnqxwlmpxllicjzzn.stag-vxzy.zettablock.com/main',
  'https://deployment-uu9y1z4z85rapgwkss1muuiz.stag-vxzy.zettablock.com/main',
  'https://deployment-ecz5O55dh0dbqagkut47kzyc.stag-vxzy.zettablock.com/main',
  'https://deployment-softlsg9z4fya3qchykaanq.stag-vxzy.zettablock.com/main'
];

// TTFT API
const ttftApiUrl = 'https://quests-usage-dev.prod.zettablock.com/api/ttft';

// REPORT USAGE API
const reportUsageApiUrl = 'https://quests-usage-dev.prod.zettablock.com/api/report_usage';

// Deployment IDs
const deploymentIds = [
  "deployment_Hp4Y88pxNQXwLMPxlLICJZzN",
  "deployment_UU9y1Z4Z85RAPGwkss1mUUiZ",
  "deployment_ECz5O55dH0dBQaGKuT47kzYC",
  "deployment_SoFftlsf9z4fyA3QCHYkaANq"
];

// Function to calculate time difference in milliseconds
const calculateTimeDifference = (startTime, endTime) => {
  return endTime - startTime;
};

// Function to send request to MAIN API
const sendMainApiRequest = async (message, deploymentId) => {
  const startTime = Date.now();
  const randomApiUrl = mainApiUrls[Math.floor(Math.random() * mainApiUrls.length)]; // Pilih URL secara acak

  try {
    const response = await axios.post(randomApiUrl, { message, stream: true }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      responseType: 'stream'
    });

    let responseData = '';
    response.data.on('data', (chunk) => {
      const chunkStr = chunk.toString();

      // Split the chunk by newline to handle multiple JSON objects
      const lines = chunkStr.split('\n');
      for (const line of lines) {
        if (line.trim() === '' || line.trim() === 'data: [DONE]') continue;

        try {
          // Remove "data: " prefix and parse JSON
          const jsonStr = line.replace('data: ', '').trim();
          if (jsonStr) {
            const jsonData = JSON.parse(jsonStr);
            if (jsonData.choices[0].delta.content) {
              responseData += jsonData.choices[0].delta.content;
            }
          }
        } catch (error) {
          console.error('Error parsing chunk:', error);
          console.error('Chunk content:', line);
        }
      }
    });

    return new Promise((resolve) => {
      response.data.on('end', () => {
        const endTime = Date.now();
        const timeToFirstToken = calculateTimeDifference(startTime, endTime);
        resolve({ responseData, timeToFirstToken });
      });
    });
  } catch (error) {
    console.error(`Error in MAIN API request for deployment ${deploymentId}:`, error);
    return null;
  }
};

// Function to send request to TTFT API
const sendTtftApiRequest = async (timeToFirstToken, deploymentId) => {
  const ttftPayload = {
    deployment_id: deploymentId,
    time_to_first_token: timeToFirstToken
  };

  try {
    const response = await axios.post(ttftApiUrl, ttftPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data.message;
  } catch (error) {
    console.error('Error in TTFT API request:', error);
  }
};

// Function to send request to REPORT USAGE API
const sendReportUsageApiRequest = async (walletAddress, requestText, responseText, deploymentId) => {
  const reportUsagePayload = {
    wallet_address: walletAddress,
    agent_id: deploymentId,
    request_text: requestText,
    response_text: responseText,
    request_metadata: {}
  };

  try {
    const response = await axios.post(reportUsageApiUrl, reportUsagePayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    return response.data.message;
  } catch (error) {
    const errorCode = error.response?.status;
    const detailedError = error.response?.data?.error || error.response?.data?.message || error.message;
    return `Error ${errorCode}: ${detailedError}`;
  }
};

// Function to display welcome message
const displayWelcomeMessage = () => {
  console.log(chalk.yellow(figlet.textSync('KiteAI', { horizontalLayout: 'full', font: 'Small' })));
};

// Function to get wallets from .env
const getWallets = () => {
  dotenv.config({ path: '.env' });
  return Object.keys(process.env)
    .filter((key) => key.startsWith('WALLET_ADDRESS_'))
    .map((key) => process.env[key]);
};

// Function to add a new wallet
const addWalletMenu = async () => {
  while (true) {
    const { walletAddress } = await inquirer.prompt([
      {
        type: 'input',
        name: 'walletAddress',
        message: 'Masukkan alamat wallet baru (kosong untuk kembali):',
      }
    ]);

    if (!walletAddress.trim()) {
      console.log(chalk.yellow('⚠ Kembali ke menu utama...'));
      return;
    }

    const newKey = `WALLET_ADDRESS_${getWallets().length + 1}`;
    fs.appendFileSync('.env', `\n${newKey}=${walletAddress}`);
    dotenv.config({ path: '.env' });
    console.log(chalk.green('✅ Wallet berhasil ditambahkan!'));
  }
};

// Function to move unknown questions to unknown_questions.json
const moveUnknownQuestion = (question) => {
  try {
    // Check if unknown_questions.json exists, if not create it
    if (!fs.existsSync('unknown_questions.json')) {
      fs.writeFileSync('unknown_questions.json', '[]');
    }

    // Read existing unknown questions
    const unknownQuestions = JSON.parse(fs.readFileSync('unknown_questions.json', 'utf-8'));

    // Add the new unknown question
    unknownQuestions.push(question);

    // Write back to unknown_questions.json
    fs.writeFileSync('unknown_questions.json', JSON.stringify(unknownQuestions, null, 2));

    console.log(chalk.yellow(`Pertanyaan "${question}" dipindahkan ke unknown_questions.json.`));
  } catch (error) {
    console.error(chalk.red(`Gagal memindahkan pertanyaan "${question}" ke unknown_questions.json:`), error);
  }
};

// Function to remove duplicate questions from payloads.json
const removeDuplicateQuestions = () => {
  try {
    // Check if unknown_questions.json exists
    if (!fs.existsSync('unknown_questions.json')) {
      console.log(chalk.yellow('⚠ File unknown_questions.json tidak ditemukan. Tidak ada pertanyaan yang dihapus.'));
      return;
    }

    // Read unknown_questions.json
    const unknownQuestions = JSON.parse(fs.readFileSync('unknown_questions.json', 'utf-8'));

    // Read payloads.json
    const payloadsData = JSON.parse(fs.readFileSync('payloads.json', 'utf-8'));

    let updatedPayloads;

    // Check if payloadsData is an array
    if (Array.isArray(payloadsData)) {
      // If payloadsData is an array, filter out questions that exist in unknownQuestions
      updatedPayloads = payloadsData.filter(
        question => !unknownQuestions.includes(question)
      );
    } else {
      // If payloadsData is an object with categories, process each category
      updatedPayloads = {};
      for (const category in payloadsData) {
        if (Array.isArray(payloadsData[category])) {
          updatedPayloads[category] = payloadsData[category].filter(
            question => !unknownQuestions.includes(question)
          );
        } else {
          console.log(chalk.red(`Kategori "${category}" dalam payloads.json bukan array.`));
          updatedPayloads[category] = payloadsData[category]; // Tetap simpan kategori yang tidak valid
        }
      }
    }

    // Write updated payloads back to payloads.json
    fs.writeFileSync('payloads.json', JSON.stringify(updatedPayloads, null, 2));

    console.log(chalk.green('✅ Pertanyaan duplikat berhasil dihapus dari payloads.json.'));
  } catch (error) {
    console.error(chalk.red('Gagal menghapus pertanyaan duplikat:'), error);
  }
};

// Function to run the script for a single question and multiple wallets
const runScriptForQuestionAndWallets = async (question, selectedWallets) => {
  console.log(chalk.magenta(`\n[Question] ${question}`));

  for (const wallet of selectedWallets) {
    // Shuffle deployment IDs
    const shuffledDeploymentIds = [...deploymentIds].sort(() => Math.random() - 0.5);

    let responseReceived = false;
    let allDeploymentsFailed = true; // Flag to track if all deployments failed

    for (const deploymentId of shuffledDeploymentIds) {
      if (responseReceived) break;

      // Send MAIN API request for each wallet and deployment ID
      const result = await sendMainApiRequest(question, deploymentId);

      if (result) {
        const { responseData, timeToFirstToken } = result;

        // Check if the response contains "Saya tidak tahu.", "I do not know.", or "I don't know."
        const lowerCaseResponse = responseData.toLowerCase();
        if (
          lowerCaseResponse.includes("saya tidak tahu") ||
          lowerCaseResponse.includes("i do not know") ||
          lowerCaseResponse.includes("i don't know")
        ) {
          console.log(chalk.red(`Pertanyaan "${question}" tidak diketahui oleh deployment ${deploymentId}.`));
          continue; // Lanjut ke deployment berikutnya
        }

        // Display TTFT and REPORT USAGE responses for each wallet and deployment ID
        const ttftResponse = await sendTtftApiRequest(timeToFirstToken, deploymentId);
        console.log(chalk.green('TTFT API Response:'), ttftResponse);

        const reportUsageResponse = await sendReportUsageApiRequest(wallet, question, responseData, deploymentId);
        console.log(chalk.blue('REPORT USAGE API Response:'), reportUsageResponse);

        // Display FULL Response Content for each wallet
        console.log(chalk.white(`Response Content for ${wallet} (${deploymentId}):`), responseData);

        responseReceived = true;
        allDeploymentsFailed = false; // Set flag to false karena ada deployment yang berhasil
      } else {
        console.log(chalk.red(`Pertanyaan "${question}" gagal direspon oleh deployment ${deploymentId}.`));
      }

      // Add delay to avoid rate limit
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }

    // Jika semua deployment gagal atau merespons "tidak tahu", pindahkan pertanyaan ke unknown_questions.json
    if (allDeploymentsFailed) {
      console.log(chalk.red(`Semua deployment gagal menjawab pertanyaan "${question}".`));
      moveUnknownQuestion(question);
    }
  }
};

// Function to run the script for multiple wallets
const runScriptForWallets = async (selectedWallets) => {
  console.log(chalk.cyan(`\nRunning script for Wallet Addresses: ${selectedWallets.join(', ')}`));

  for (const question of payloads) {
    await runScriptForQuestionAndWallets(question, selectedWallets);
  }
};

// Main menu function
const mainMenu = async () => {
  const { menuOption } = await inquirer.prompt([
    {
      type: 'list',
      name: 'menuOption',
      message: 'Pilih opsi:',
      choices: ['Run Script', 'Tambah Wallet', 'Keluar']
    }
  ]);

  if (menuOption === 'Run Script') {
    const wallets = getWallets();
    if (wallets.length === 0) {
      console.log(chalk.red('✖ Tidak ada wallet yang tersedia. Silakan tambahkan wallet terlebih dahulu.'));
      await mainMenu();
      return;
    }

    const { selectedWallets } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedWallets',
        message: 'Pilih wallet untuk digunakan:',
        choices: wallets
      }
    ]);

    if (selectedWallets.length === 0) {
      console.log(chalk.yellow('⚠ Tidak ada wallet yang dipilih. Kembali ke menu utama...'));
      await mainMenu();
      return;
    }

    await runScriptForWallets(selectedWallets);
    await mainMenu();
  } else if (menuOption === 'Tambah Wallet') {
    await addWalletMenu();
    dotenv.config({ path: '.env' });
    await mainMenu();
  } else {
    console.log(chalk.red('✖ Operasi dibatalkan.'));
    process.exit(0);
  }
};

// Main function to execute the flow
const main = async () => {
  displayWelcomeMessage();

  // Remove duplicate questions before running the script
  removeDuplicateQuestions();

  // Reload payloads after removing duplicates
  payloads = JSON.parse(fs.readFileSync('payloads.json', 'utf-8'));

  await mainMenu();
};

// Run the main function
main();

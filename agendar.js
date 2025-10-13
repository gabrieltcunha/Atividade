
const API_URL = 'https://script.google.com/macros/s/AKfycbwr-9iMV6ROUTOVHwyb6tnntj9ZzVtANSQJVIyang5Pyd5WUDi5HCImmS8wCL_4j7W1/exec';

// ====================================================================
// === VARIÁVEIS GLOBAIS ===
// ====================================================================
let allSlotsData = {}; // Para armazenar todos os horários buscados da API

// Seletores dos elementos do formulário
const loadingDiv = document.getElementById('loading');
const form = document.getElementById('form-agendamento-paciente');
const successMessage = document.getElementById('mensagem-sucesso');

// Seletores dos PASSOS
const stepTipo = document.getElementById('step-tipo');
const stepLocal = document.getElementById('step-local');
const stepData = document.getElementById('step-data');
const stepHorario = document.getElementById('step-horario');
const stepDados = document.getElementById('step-dados-pessoais');
const stepConcluir = document.getElementById('step-concluir');

// Seletores dos CAMPOS (selects e inputs)
const selectTipo = document.getElementById('select-tipo');
const selectLocal = document.getElementById('select-local');
const selectData = document.getElementById('select-data');
const selectHorario = document.getElementById('select-horario');

// ====================================================================
// === INICIALIZAÇÃO ===
// ====================================================================

// Função principal que é executada quando a página carrega
async function iniciarAgendamento() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error('Falha ao carregar dados da agenda.');
    allSlotsData = await response.json();
    
    // Esconde o loading e mostra o formulário (apenas o primeiro passo)
    loadingDiv.classList.add('hidden');
    form.classList.remove('hidden');

  } catch (error) {
    console.error(error);
    loadingDiv.innerHTML = '<p class="aviso-sem-horario">Não foi possível carregar a agenda. Tente novamente mais tarde.</p>';
  }
}

// ====================================================================
// === FUNÇÕES DE LÓGICA DO FORMULÁRIO ===
// ====================================================================

// Reseta e esconde todos os passos a partir de um certo ponto
function resetStepsFrom(stepNumber) {
    if (stepNumber <= 2) {
        stepLocal.classList.add('hidden');
        selectLocal.value = '';
    }
    if (stepNumber <= 3) {
        stepData.classList.add('hidden');
        selectData.innerHTML = '<option value="" selected disabled>Selecione uma data</option>';
    }
    if (stepNumber <= 4) {
        stepHorario.classList.add('hidden');
        selectHorario.innerHTML = '<option value="" selected disabled>Selecione um horário</option>';
    }
    if (stepNumber <= 5) {
        stepDados.classList.add('hidden');
        stepConcluir.classList.add('hidden');
        // Não limpa os campos de dados pessoais para conveniência
    }
}

// Popula o select de DATAS com base no tipo e local
function populateDatas(tipoConsulta, local) {
    const datasDisponiveis = new Set(); // Usar Set para evitar datas duplicadas

    // Itera sobre todos os dias retornados pela API
    for (const dia in allSlotsData) {
        const slotsDoDia = allSlotsData[dia];
        let temSlotValido = false;

        if (tipoConsulta === 'Online') {
            // Se for online, qualquer horário disponível serve
            if (slotsDoDia.length > 0) temSlotValido = true;
        } else {
            // Se for presencial, verifica se há horário para o local específico
            temSlotValido = slotsDoDia.some(slot => slot.cidade === local);
        }

        if (temSlotValido) {
            datasDisponiveis.add(dia);
        }
    }

    // Limpa o select antes de adicionar novas opções
    selectData.innerHTML = '<option value="" selected disabled>Selecione uma data</option>';
    
    // Ordena as datas e cria as opções no select
    const datasOrdenadas = Array.from(datasDisponiveis).sort();
    datasOrdenadas.forEach(dia => {
        const option = document.createElement('option');
        const dataObj = new Date(dia + 'T12:00:00'); // Adiciona T12 para evitar problemas de fuso
        option.value = dia;
        option.textContent = dataObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
        selectData.appendChild(option);
    });
}

// Popula o select de HORÁRIOS com base na data, tipo e local selecionados
function populateHorarios() {
    const dataSelecionada = selectData.value;
    const tipoConsulta = selectTipo.value;
    const local = selectLocal.value;

    const horariosDoDia = allSlotsData[dataSelecionada];
    
    selectHorario.innerHTML = '<option value="" selected disabled>Selecione um horário</option>';

    if (!horariosDoDia) return;

    horariosDoDia.forEach(slot => {
        let horarioValido = false;
        if (tipoConsulta === 'Online') {
            horarioValido = true; // Se online, qualquer horário é válido
        } else {
            if (slot.cidade === local) horarioValido = true; // Se presencial, filtra por local
        }
        
        if (horarioValido) {
            const option = document.createElement('option');
            option.value = slot.iso; // O valor é o ISO completo, que será enviado para a API
            option.textContent = `${slot.horario} - ${slot.cidade}`;
            selectHorario.appendChild(option);
        }
    });
}

// ====================================================================
// === EVENT LISTENERS (QUEM CONTROLA O FLUXO) ===
// ====================================================================

// Inicia tudo quando a página carrega
document.addEventListener('DOMContentLoaded', iniciarAgendamento);

// 1. Quando o TIPO de consulta muda
selectTipo.addEventListener('change', () => {
    const tipo = selectTipo.value;
    resetStepsFrom(2); // Reseta todos os passos seguintes

    if (tipo === 'Online') {
        populateDatas('Online', null); // Popula datas para qualquer local
        stepData.classList.remove('hidden'); // Pula direto para o passo da data
    } else if (tipo) {
        stepLocal.classList.remove('hidden'); // Mostra o passo do local
    }
});

// 2. Quando o LOCAL de atendimento muda
selectLocal.addEventListener('change', () => {
    const local = selectLocal.value;
    resetStepsFrom(3); // Reseta os passos de data em diante
    
    if (local) {
        populateDatas(selectTipo.value, local);
        stepData.classList.remove('hidden');
    }
});

// 3. Quando a DATA muda
selectData.addEventListener('change', () => {
    resetStepsFrom(4); // Reseta o passo de horário
    if (selectData.value) {
        populateHorarios();
        stepHorario.classList.remove('hidden');
    }
});

// 4. Quando o HORÁRIO muda
selectHorario.addEventListener('change', () => {
    resetStepsFrom(5);
    if (selectHorario.value) {
        stepDados.classList.remove('hidden');
        stepConcluir.classList.remove('hidden');
    }
});

// 5. Quando o FORMULÁRIO é enviado
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btnSubmit = stepConcluir.querySelector('button');
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'ENVIANDO...';

    const formData = new FormData(form);
    const dados = Object.fromEntries(formData.entries());
    
    // No modo online, o local pode não ter sido selecionado. Pegamos do horário.
    if (!dados.cidade) {
        const selectedOption = selectHorario.options[selectHorario.selectedIndex];
        dados.cidade = allSlotsData[selectData.value].find(slot => slot.iso === selectedOption.value).cidade;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(dados),
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        });

        const resultado = await response.json();
        if (resultado.success) {
            form.classList.add('hidden');
            successMessage.classList.remove('hidden');
        } else {
            throw new Error(resultado.error || 'Erro desconhecido ao agendar.');
        }
    } catch (error) {
        console.error('Erro ao submeter agendamento:', error);
        alert('Não foi possível completar o agendamento. Verifique seus dados e tente novamente.');
        btnSubmit.disabled = false;
        btnSubmit.textContent = 'CONCLUIR AGENDAMENTO';
    }
});
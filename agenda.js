// ====================================================================
// === CONFIGURAÇÃO GOOGLE CALENDAR API (SUBSTITUA SUA CHAVE AQUI) ===
// ====================================================================

// ⚠️ SUBSTITUA COM O SEU ID DO CLIENTE REAL
const CLIENT_ID = '188770703397-16ld6bmal6hp81rskfupkjq0fusp7q74.apps.googleusercontent.com'; 
const SCOPES = 'https://www.googleapis.com/auth/calendar'; 
const CALENDAR_ID = 'primary'; 

// ====================================================================
// === VARIÁVEIS DE CONTROLE E CONSTANTES ORIGINAIS ===
// ====================================================================

const ALTURA_HORA = 50; // pixels
const DURACAO_CONSULTA = 30; // minutos
const TEMPLATE_DISP_SUMMARY = 'BLOCO DISPONÍVEL'; // Título para identificar a disponibilidade no Google Calendar

// Seletores de UI
const containerDias = document.getElementById('containerDias');
const btnAnterior = document.getElementById('btnAnterior');
const btnProximo = document.getElementById('btnProximo');
const btnAuth = document.getElementById('btnAuth');
const authStatus = document.getElementById('authStatus');

// Modais e Formulários
const modalDisponibilidade = document.getElementById('modalDisponibilidade');
const formDisponibilidade = document.getElementById('formDisponibilidade');
const btnExcluirDisponibilidade = document.getElementById('btnExcluirDisponibilidade');
const tituloModalDisponibilidade = document.getElementById('tituloModalDisponibilidade');
const campoCidadeDisp = document.getElementById('cidadeDisponibilidade');

const modalGerenciarDisponibilidade = document.getElementById('modalGerenciarDisponibilidade');
const tituloGerenciarDisponibilidade = document.getElementById('tituloGerenciarDisponibilidade');
const listaBlocosDia = document.getElementById('listaBlocosDia');
const btnNovoBloco = document.getElementById('btnNovoBloco');

const modalAgendamento = document.getElementById('modalAgendamento');
const formAgendamento = document.getElementById('formAgendamento');
const btnExcluirAgendamento = document.getElementById('btnExcluirAgendamento');
const displayLocalConsulta = document.getElementById('localConsultaDisplay');
const selecaoHorario = document.getElementById('selecaoHorario');

// Variáveis de Estado
let inicioSemanaAtual = new Date();
let dataChaveAtual = ''; 
const nomesDiasSemana = ['Dom', 'Segunda-Feira', 'Terça-Feira', 'Quarta-Feira', 'Quinta-Feira', 'Sexta-Feira', 'Sábado'];
let listaEventosCache = []; 
let isSignedIn = false;
let gAuth; // Variável para o Google Identity Services (GIS)

// --- Funções Auxiliares de Tempo e Validação ---

function tempoParaMinutos(horaStr) {
    const [horas, minutos] = horaStr.split(':').map(Number);
    return (horas * 60 + minutos) - (6 * 60); // Minutos totais desde 06:00
}

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false;
    return true;
}

// -------------------------------------------------------------------------------------------------
// === FUNÇÕES DE CONVERSÃO GOOGLE API PARA DADOS DA AGENDA ===
// -------------------------------------------------------------------------------------------------

/**
 * Converte um evento do Google para um objeto de disponibilidade.
 */
function eventoParaDisponibilidade(evento) {
    // Usa Extended Properties para dados adicionais se estiver disponível
    const props = evento.extendedProperties ? evento.extendedProperties.shared : {};
    
    return {
        id: evento.id,
        dia: new Date(evento.start.dateTime).getDate(),
        mes: new Date(evento.start.dateTime).getMonth() + 1,
        inicio: new Date(evento.start.dateTime).toTimeString().substring(0, 5),
        fim: new Date(evento.end.dateTime).toTimeString().substring(0, 5),
        cidade: props.cidade || evento.location || 'Lagamar'
    };
}

/**
 * Converte um evento do Google para um objeto de agendamento.
 */
function eventoParaAgendamento(evento) {
    // Extração de dados do description
    const description = evento.description || '';
    const cpfMatch = description.match(/CPF:\s*([^\n]+)/);
    const telefoneMatch = description.match(/Telefone:\s*([^\n]+)/);
    const tipoMatch = description.match(/Tipo:\s*([^\n]+)/);
    
    return {
        id: evento.id,
        dia: new Date(evento.start.dateTime).getDate(),
        mes: new Date(evento.start.dateTime).getMonth() + 1,
        inicio: new Date(evento.start.dateTime).toTimeString().substring(0, 5),
        nome: evento.summary.split('-')[0].trim(),
        cpf: cpfMatch ? cpfMatch[1].trim() : '',
        telefone: telefoneMatch ? telefoneMatch[1].trim() : '',
        tipo: tipoMatch ? tipoMatch[1].trim() : 'Consulta',
        local: evento.location || 'Lagamar'
    };
}

/**
 * Processa a lista de eventos brutos da API para as estruturas de dados do seu app.
 */
function processarEventosDoGoogle(eventos) {
    const agendamentos = [];
    const disponibilidades = [];

    eventos.forEach(evento => {
        if (!evento.start || !evento.start.dateTime || evento.status === 'cancelled') return;

        if (evento.summary && evento.summary.startsWith(TEMPLATE_DISP_SUMMARY)) {
            disponibilidades.push(eventoParaDisponibilidade(evento));
        } else {
            agendamentos.push(eventoParaAgendamento(evento));
        }
    });

    return { agendamentos, disponibilidades };
}

// -------------------------------------------------------------------------------------------------
// === FUNÇÕES DE AUTENTICAÇÃO E INICIALIZAÇÃO (NOVO FLUXO GIS) ===
// -------------------------------------------------------------------------------------------------

/**
 * Inicializa o Google Identity Services (GIS) para obter tokens de acesso.
 */
function initGis() {
    // Certifique-se de que google.accounts.oauth2 está carregado
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        gAuth = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    // Token obtido: configura gapi e atualiza o estado
                    gapi.client.setToken(tokenResponse);
                    updateSigninStatus(true);
                } else {
                    updateSigninStatus(false);
                }
            },
        });
        // Tenta obter o estado inicial (caso o usuário já tenha logado)
        const token = gapi.client.getToken();
        if (token) {
             updateSigninStatus(true);
        }
    }
}

/**
 * Carrega a biblioteca Google API Client (gapi) para fazer chamadas à API Calendar.
 */
function initGapi() {
    gapi.client.load('calendar', 'v3', () => {
        // Inicializa o GIS logo após o gapi.client estar pronto
        initGis();
    });
}

/**
 * Atualiza o status de login na UI e renderiza a agenda.
 */
function updateSigninStatus(status) {
    isSignedIn = status;
    if (isSignedIn) {
        authStatus.textContent = 'Status: Conectado. Agenda carregada.';
        btnAuth.textContent = 'Sair do Google';
        btnAuth.style.backgroundColor = '#2196F3';
        // Inicia o carregamento da agenda
        renderizarSemana(inicioSemanaAtual);
    } else {
        authStatus.textContent = 'Status: Desconectado. Faça login para usar.';
        btnAuth.textContent = 'Fazer Login com Google';
        btnAuth.style.backgroundColor = '#f44336';
        containerDias.innerHTML = ''; // Limpa a agenda
    }
}

/**
 * Manipula o clique no botão de login/logout.
 */
function handleAuthClick() {
    if (!isSignedIn) {
        // Inicia o fluxo de login via GIS
        if (gAuth) {
            gAuth.requestAccessToken();
        } else {
            alert('Aguarde o carregamento do sistema de login do Google.');
        }
    } else {
        // Revoga o token de acesso (Logout)
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token, () => {
                gapi.client.setToken(null);
                updateSigninStatus(false);
            }, { prompt: 'none' }); // Adicionado para evitar pop-up de logout
        }
    }
}

// O ponto de entrada principal: Carrega a biblioteca gapi primeiro.
gapi.load('client', initGapi);


// -------------------------------------------------------------------------------------------------
// === FUNÇÕES DE RENDERIZAÇÃO DA AGENDA (ADAPTADAS) ===
// -------------------------------------------------------------------------------------------------

function renderizarSemana(dataInicio) {
    if (!isSignedIn) return;

    // 1. Calcula o intervalo de tempo para a API
    let diaInicial = new Date(dataInicio);
    // Ajusta para o início da semana (Segunda-feira = 1, Domingo = 0)
    let diaSemana = diaInicial.getDay();
    diaSemana = diaSemana === 0 ? 6 : diaSemana - 1; // 0=Dom -> 6, 1=Seg -> 0
    diaInicial.setDate(dataInicio.getDate() - diaSemana);
    
    // Define o timeMin para a Segunda-feira 00:00:00
    diaInicial.setHours(0, 0, 0, 0); 
    const timeMin = diaInicial.toISOString();

    // Define o timeMax para o Domingo da próxima semana 23:59:59 (para buscar 7 dias)
    let diaFinal = new Date(diaInicial);
    diaFinal.setDate(diaInicial.getDate() + 6);
    diaFinal.setHours(23, 59, 59, 999);
    const timeMax = diaFinal.toISOString();


    // 2. Chamada à Google Calendar API
    gapi.client.calendar.events.list({
        'calendarId': CALENDAR_ID,
        'timeMin': timeMin,
        'timeMax': timeMax,
        'showDeleted': false,
        'singleEvents': true,
        'orderBy': 'startTime'
    }).then(function(response) {
        listaEventosCache = response.result.items;
        const { agendamentos, disponibilidades } = processarEventosDoGoogle(listaEventosCache);
        
        containerDias.innerHTML = ''; 
        
        // Renderiza as 6 colunas (Segunda a Sábado)
        for (let i = 0; i < 6; i++) {
            let dataAtual = new Date(diaInicial);
            dataAtual.setDate(diaInicial.getDate() + i);
            
            const dia = dataAtual.getDate();
            const mes = dataAtual.getMonth() + 1;

            const agendDia = agendamentos.filter(a => a.dia === dia && a.mes === mes);
            const dispDia = disponibilidades.filter(d => d.dia === dia && d.mes === mes);
            
            containerDias.innerHTML += renderizarColunaDia(dataAtual, dispDia, agendDia);
        }
    }).catch(function(err) {
        alert('Erro ao carregar agenda. Verifique as permissões.');
        console.error('Erro ao buscar eventos: ', err);
    });
}

// Restante das funções de Renderização, Modais e CRUD (mantidas com as adaptações da API)

function renderizarColunaDia(data, disponibilidadeDoDia, agendamentosDoDia) {
    const dia = data.getDate();
    const mes = data.getMonth() + 1;
    const dataChave = `${dia}/${mes}`;
    
    let htmlDisponibilidade = '';
    disponibilidadeDoDia.forEach(disp => {
        htmlDisponibilidade += criarHTMLDisponibilidade(disp);
    });

    let htmlAgendamentos = '';
    agendamentosDoDia.forEach(app => {
        htmlAgendamentos += criarHTMLAgendamento(app);
    });

    let htmlDia = `<div class="coluna-dia" data-data-chave="${dataChave}" data-timestamp="${data.getTime()}">
        <div class="cabecalho-dia" data-data="${dataChave}">
            <div class="data">${dia.toString().padStart(2, '0')}/${mes.toString().padStart(2, '0')}</div>
            <div class="dia-semana">${nomesDiasSemana[data.getDay()]}</div>
        </div>`;
    
    let htmlCelulasHora = '';
    for (let h = 6; h < 19; h++) {
        for (let m = 0; m < 60; m += DURACAO_CONSULTA) {
            if (h === 18 && m === DURACAO_CONSULTA) continue;
            const horaStr = h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
            htmlCelulasHora += `<div class="celula-hora" data-hora="${horaStr}"></div>`;
        }
    }

    htmlDia += `<div class="faixas-dia">
        ${htmlCelulasHora}
    </div>
    ${htmlDisponibilidade}
    ${htmlAgendamentos}`;
    htmlDia += `</div>`;
    return htmlDia;
}

function criarHTMLDisponibilidade(disponibilidade) {
    const minutosInicio = tempoParaMinutos(disponibilidade.inicio);
    const posicaoTopo = (minutosInicio / DURACAO_CONSULTA) * (ALTURA_HORA / 2) + ALTURA_HORA;
    const duracaoMinutos = tempoParaMinutos(disponibilidade.fim) - minutosInicio;
    const altura = (duracaoMinutos / DURACAO_CONSULTA) * (ALTURA_HORA / 2);

    return `
        <div class="bloco-disponivel" 
             data-id-disp="${disponibilidade.id}"
             data-cidade="${disponibilidade.cidade}"
             style="top: ${posicaoTopo}px; height: ${altura}px;">
             ${disponibilidade.cidade}
        </div>
    `;
}

function criarHTMLAgendamento(agendamento) {
    const minutosInicio = tempoParaMinutos(agendamento.inicio);
    const posicaoTopo = (minutosInicio / DURACAO_CONSULTA) * (ALTURA_HORA / 2) + ALTURA_HORA;
    const altura = (DURACAO_CONSULTA / DURACAO_CONSULTA) * (ALTURA_HORA / 2);

    return `
        <div class="agendamento" 
             data-id-agend="${agendamento.id}"
             data-inicio="${agendamento.inicio}"
             data-cidade="${agendamento.local}"
             style="top: ${posicaoTopo}px; height: ${altura}px;">
             <div class="conteudo-agendamento">
                 <p>${agendamento.nome}</p>
             </div>
        </div>
    `;
}


// -------------------------------------------------------------------------------------------------
// === FUNÇÕES DE CRUD (USANDO GOOGLE API) ===
// -------------------------------------------------------------------------------------------------

function tratarEnvioDisponibilidade(e) {
    e.preventDefault();
    const form = e.target;
    const [dia, mes] = form.dataDisponibilidade.value.split('/').map(Number);
    const ano = inicioSemanaAtual.getFullYear();

    const dataHoraInicio = new Date(ano, mes - 1, dia, form.inicio.value.split(':')[0], form.inicio.value.split(':')[1]);
    const dataHoraFim = new Date(ano, mes - 1, dia, form.fim.value.split(':')[0], form.fim.value.split(':')[1]);

    if (dataHoraInicio.getTime() >= dataHoraFim.getTime()) {
        alert('A hora de início deve ser anterior à hora de fim.');
        return;
    }

    const evento = {
        'summary': `${TEMPLATE_DISP_SUMMARY} - ${form.cidade.value}`,
        'location': form.cidade.value,
        'start': {
            'dateTime': dataHoraInicio.toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        'end': {
            'dateTime': dataHoraFim.toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        'extendedProperties': {
            'shared': {
                'cidade': form.cidade.value
            }
        }
    };

    const promise = form.idDisponibilidade.value
        ? gapi.client.calendar.events.update({
            'calendarId': CALENDAR_ID,
            'eventId': form.idDisponibilidade.value,
            'resource': evento
        })
        : gapi.client.calendar.events.insert({
            'calendarId': CALENDAR_ID,
            'resource': evento
        });

    promise.then(() => {
        fecharModalDisponibilidade();
        renderizarSemana(inicioSemanaAtual);
    }).catch(err => alert('Erro na Disponibilidade: ' + err.result.error.message));
}

function tratarExclusaoDisponibilidade() {
    const idParaExcluir = document.getElementById('idDisponibilidade').value;
    if (!confirm('Tem certeza que deseja excluir este bloco de disponibilidade?')) return;

    gapi.client.calendar.events.delete({
        'calendarId': CALENDAR_ID,
        'eventId': idParaExcluir
    }).then(() => {
        fecharModalDisponibilidade();
        renderizarSemana(inicioSemanaAtual);
    }).catch(err => alert('Erro ao excluir bloco: ' + err.result.error.message));
}

function tratarEnvioAgendamento(e) {
    e.preventDefault();
    const form = e.target;
    const [dia, mes] = form.dataAgendamento.value.split('/').map(Number);
    const ano = inicioSemanaAtual.getFullYear(); 
    const horaInicioSelecionada = form.selecaoHorario.value;
    
    if (!validarCPF(form.cpf.value)) {
        alert('CPF inválido ou em formato incorreto. Por favor, corrija.');
        return;
    }

    const dataHoraInicio = new Date(ano, mes - 1, dia, horaInicioSelecionada.split(':')[0], horaInicioSelecionada.split(':')[1]);
    const dataHoraFim = new Date(dataHoraInicio.getTime() + DURACAO_CONSULTA * 60000);

    const evento = {
        'summary': `${form.nome.value} - ${form.tipoConsulta.value}`,
        'location': form.cidadeAgendamento.value,
        'description': `CPF: ${form.cpf.value}\nTelefone: ${form.telefone.value}\nTipo: ${form.tipoConsulta.value}`,
        'start': {
            'dateTime': dataHoraInicio.toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        'end': {
            'dateTime': dataHoraFim.toISOString(),
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone
        }
    };

    const promise = form.idAgendamento.value
        ? gapi.client.calendar.events.update({
            'calendarId': CALENDAR_ID,
            'eventId': form.idAgendamento.value,
            'resource': evento
        })
        : gapi.client.calendar.events.insert({
            'calendarId': CALENDAR_ID,
            'resource': evento
        });

    promise.then(() => {
        fecharModalAgendamento();
        renderizarSemana(inicioSemanaAtual);
    }).catch(err => alert('Erro no Agendamento: ' + err.result.error.message));
}

function tratarExclusaoAgendamento() {
    const idParaExcluir = document.getElementById('idAgendamento').value;
    if (!confirm('Tem certeza que deseja excluir esta consulta?')) return;

    gapi.client.calendar.events.delete({
        'calendarId': CALENDAR_ID,
        'eventId': idParaExcluir
    }).then(() => {
        fecharModalAgendamento();
        renderizarSemana(inicioSemanaAtual);
    }).catch(err => alert('Erro ao excluir agendamento: ' + err.result.error.message));
}

// -------------------------------------------------------------------------------------------------
// === FUNÇÕES DE MODAL E INTERAÇÃO ===
// -------------------------------------------------------------------------------------------------

function fecharModalDisponibilidade() { modalDisponibilidade.style.display = 'none'; formDisponibilidade.reset(); }
function fecharModalAgendamento() { modalAgendamento.style.display = 'none'; formAgendamento.reset(); }
function fecharModalGerenciarDisponibilidade() { modalGerenciarDisponibilidade.style.display = 'none'; }

function gerarSlotsDeTempo(dataChave, blocoDisp, agendamentos) {
    const [dia, mes] = dataChave.split('/').map(Number);
    const slots = [];
    
    const inicioBloco = new Date(`2000/01/01 ${blocoDisp.inicio}`);
    const fimBloco = new Date(`2000/01/01 ${blocoDisp.fim}`);
    
    let tempoAtual = new Date(inicioBloco);
    
    while (tempoAtual.getTime() < fimBloco.getTime()) {
        const horaStr = tempoAtual.toTimeString().substring(0, 5);
        
        if (new Date(tempoAtual.getTime() + DURACAO_CONSULTA * 60000).getTime() <= fimBloco.getTime()) {
            
            const ocupado = agendamentos.some(app =>
                app.dia === dia && app.mes === mes && app.inicio === horaStr
            );
            
            slots.push({ hora: horaStr, ocupado: ocupado });
        }
        tempoAtual.setTime(tempoAtual.getTime() + DURACAO_CONSULTA * 60000);
    }
    return slots;
}

function abrirModalAgendamento(dataChave, horaInicialSugerida, cidadeAtendimento, agendamento = null) {
    // É importante processar o cache aqui para obter o status mais recente dos slots
    const { agendamentos, disponibilidades } = processarEventosDoGoogle(listaEventosCache);
    dataChaveAtual = dataChave; 
    
    document.getElementById('dataAgendamento').value = dataChave;
    document.getElementById('cidadeAgendamento').value = cidadeAtendimento;
    displayLocalConsulta.textContent = cidadeAtendimento;
    selecaoHorario.innerHTML = '';
    
    if (!agendamento) {
        const [dia, mes] = dataChave.split('/').map(Number);
        
        const blocosDoDia = disponibilidades.filter(d => 
            d.dia === dia && d.mes === mes && d.cidade === cidadeAtendimento
        );
        
        if (blocosDoDia.length === 0) {
            alert('Não há horários de atendimento definidos para esta cidade neste dia.');
            return;
        }

        let slotLivreEncontrado = false;
        
        blocosDoDia.forEach(bloco => {
            const slots = gerarSlotsDeTempo(dataChave, bloco, agendamentos);
            slots.forEach(slot => {
                const option = document.createElement('option');
                option.value = slot.hora;
                option.textContent = slot.hora + (slot.ocupado ? ' (Ocupado)' : ' (Livre)');
                if (slot.ocupado) {
                    option.disabled = true;
                }
                selecaoHorario.appendChild(option);
                if (slot.hora === horaInicialSugerida && !slot.ocupado) {
                    option.selected = true;
                    slotLivreEncontrado = true;
                }
            });
        });
        
        if (!slotLivreEncontrado && horaInicialSugerida) {
            selecaoHorario.value = '';
        }

        document.getElementById('tituloModalAgendamento').textContent = 'Nova Consulta';
        document.getElementById('idAgendamento').value = '';
        btnExcluirAgendamento.style.display = 'none';
        formAgendamento.reset();

    } else {
        // Lógica para edição de agendamento 
        selecaoHorario.innerHTML = `<option value="${agendamento.inicio}">${agendamento.inicio} (Agendado)</option>`;
        selecaoHorario.value = agendamento.inicio;
        document.getElementById('tituloModalAgendamento').textContent = `Consulta das ${agendamento.inicio}`;
        document.getElementById('idAgendamento').value = agendamento.id;
        document.getElementById('nome').value = agendamento.nome;
        document.getElementById('cpf').value = agendamento.cpf;
        document.getElementById('telefone').value = agendamento.telefone;
        document.getElementById('tipoConsulta').value = agendamento.tipo;
        btnExcluirAgendamento.style.display = 'inline-block';
    }
    modalAgendamento.style.display = 'block';
}


function abrirModalDisponibilidade(dataChave, disp = null) {
    fecharModalGerenciarDisponibilidade();
    dataChaveAtual = dataChave;
    
    tituloModalDisponibilidade.textContent = disp ? 'Editar Bloco de Horário' : 'Novo Bloco de Atendimento';
    document.getElementById('dataDisponibilidade').value = dataChave;
    if (disp) {
        document.getElementById('idDisponibilidade').value = disp.id;
        document.getElementById('inicioDisponibilidade').value = disp.inicio;
        document.getElementById('fimDisponibilidade').value = disp.fim;
        campoCidadeDisp.value = disp.cidade;
        btnExcluirDisponibilidade.style.display = 'inline-block';
    } else {
        document.getElementById('idDisponibilidade').value = '';
        document.getElementById('inicioDisponibilidade').value = '08:00';
        document.getElementById('fimDisponibilidade').value = '18:00';
        campoCidadeDisp.value = 'Lagamar';
        btnExcluirDisponibilidade.style.display = 'none';
    }
    modalDisponibilidade.style.display = 'block';
}


function abrirModalGerenciarDisponibilidade(dataChave, dataCompleta) {
    dataChaveAtual = dataChave;
    const { disponibilidades } = processarEventosDoGoogle(listaEventosCache);
    
    const diaFormatado = dataCompleta.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    tituloGerenciarDisponibilidade.textContent = `Horários de Atendimento em ${diaFormatado}`;
    
    const [dia, mes] = dataChave.split('/').map(Number);
    const blocosDoDia = disponibilidades.filter(d => d.dia === dia && d.mes === mes);
    listaBlocosDia.innerHTML = '';
    
    if (blocosDoDia.length === 0) {
        listaBlocosDia.innerHTML = '<p>Nenhum horário de atendimento definido para este dia.</p>';
    } else {
        blocosDoDia.forEach(bloco => {
            const divBloco = document.createElement('div');
            divBloco.className = 'bloco-lista';
            divBloco.innerHTML = `
                <div>
                    <strong>${bloco.inicio} - ${bloco.fim}</strong><br>
                    <span>Cidade: ${bloco.cidade}</span>
                </div>
                <button class="btn-editar-bloco" data-id-disp="${bloco.id}">Editar</button>
            `;
            listaBlocosDia.appendChild(divBloco);
        });
    }
    modalGerenciarDisponibilidade.style.display = 'block';
}


// -------------------------------------------------------------------------------------------------
// === EVENT LISTENERS GLOBAIS ===
// -------------------------------------------------------------------------------------------------

btnAnterior.addEventListener('click', () => {
    inicioSemanaAtual.setDate(inicioSemanaAtual.getDate() - 7);
    renderizarSemana(inicioSemanaAtual);
});

btnProximo.addEventListener('click', () => {
    inicioSemanaAtual.setDate(inicioSemanaAtual.getDate() + 7);
    renderizarSemana(inicioSemanaAtual);
});

containerDias.addEventListener('click', (e) => {
    let elementoCabecalho = e.target.closest('.cabecalho-dia');
    if (elementoCabecalho) {
        const dataChave = elementoCabecalho.dataset.data;
        const colunaDia = elementoCabecalho.closest('.coluna-dia');
        const dataCompleta = new Date(parseInt(colunaDia.dataset.timestamp));
        abrirModalGerenciarDisponibilidade(dataChave, dataCompleta);
        return;
    }

    let elementoAgend = e.target.closest('.agendamento');
    if (elementoAgend) {
        const idAgend = elementoAgend.dataset.idAgend;
        const evento = listaEventosCache.find(ev => ev.id === idAgend);
        if (evento) {
            const agendamento = eventoParaAgendamento(evento);
            abrirModalAgendamento(`${agendamento.dia}/${agendamento.mes}`, agendamento.inicio, agendamento.local, agendamento);
        }
        return;
    }

    let elementoDisp = e.target.closest('.bloco-disponivel');
    if (elementoDisp) {
        const dataChave = elementoDisp.closest('.coluna-dia').dataset.dataChave;
        const cidade = elementoDisp.dataset.cidade;
        
        const rect = elementoDisp.getBoundingClientRect();
        const yRelativo = e.clientY - rect.top;
        const intervalos30min = Math.floor(yRelativo / (ALTURA_HORA / 2));
        
        const idDisp = elementoDisp.dataset.idDisp;
        const eventoDisp = listaEventosCache.find(ev => ev.id === idDisp);
        
        if (eventoDisp) {
            const disp = eventoParaDisponibilidade(eventoDisp);
            const [hInicio, mInicio] = disp.inicio.split(':').map(Number);
            let totalMinutos = hInicio * 60 + mInicio + intervalos30min * DURACAO_CONSULTA;
            const hora = Math.floor(totalMinutos / 60) % 24;
            const minutos = totalMinutos % 60;
            const horaAgendamento = `${hora.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}`;
            
            abrirModalAgendamento(dataChave, horaAgendamento, cidade, null);
        }
        return;
    }
});


btnNovoBloco.addEventListener('click', () => abrirModalDisponibilidade(dataChaveAtual));

listaBlocosDia.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar-bloco');
    if (btnEditar) {
        const idDisp = btnEditar.dataset.idDisp;
        const evento = listaEventosCache.find(ev => ev.id === idDisp);
        if (evento) {
            const disp = eventoParaDisponibilidade(evento);
            abrirModalDisponibilidade(dataChaveAtual, disp);
        }
    }
});

formDisponibilidade.addEventListener('submit', tratarEnvioDisponibilidade);
btnExcluirDisponibilidade.addEventListener('click', tratarExclusaoDisponibilidade);
formAgendamento.addEventListener('submit', tratarEnvioAgendamento);
btnExcluirAgendamento.addEventListener('click', tratarExclusaoAgendamento);
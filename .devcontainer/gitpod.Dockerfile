FROM ghcr.io/sirherobrine23/initjs:latest
# Add non root user and Install oh my zsh
RUN initjs create-user --username "gitpod" --uid "33333" --gid "33333" --groups sudo --groups docker
USER gitpod
WORKDIR /home/gitpod
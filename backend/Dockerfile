FROM ubuntu:latest

# Install common dependencies
RUN apt update && apt install -y \
    curl wget git build-essential \
    python3 python3-pip \
    nodejs npm \
    yarn \
    rustc cargo \
    && apt clean

# Ensure Python and Node versions
RUN python3 --version && pip3 --version && node --version && npm --version && yarn --version && cargo --version

# Set default shell
CMD ["/bin/bash"]
